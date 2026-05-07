---
title: K3s 完全指南：轻量级 Kubernetes 从入门到实战
published: 2026-02-09
description: 全面介绍 K3s 轻量级 Kubernetes 发行版，涵盖架构原理、安装配置、集群管理、存储网络、监控告警等核心内容。K3s 专为边缘计算、IoT 设备和资源受限环境设计，提供完整的生产级 Kubernetes 体验。
tags: [K3s, Kubernetes, 容器编排, 边缘计算, IoT, DevOps, 云原生]
category: DevOps/部署
draft: false
---

K3s 是由 Rancher Labs（现为 SUSE 旗下）开发的轻量级 Kubernetes 发行版，专为边缘计算、IoT 设备、CI/CD 环境和资源受限场景设计。

### 常用命令速查

```bash
# 安装与卸载
curl -sfL https://get.k3s.io | sh -                    # 安装 K3s
/usr/local/bin/k3s-uninstall.sh                         # 卸载 K3s

# 集群管理
sudo k3s kubectl get nodes                              # 查看节点
sudo systemctl status k3s                               # 查看服务状态
sudo journalctl -u k3s -f                               # 查看日志
sudo cat /var/lib/rancher/k3s/server/node-token        # 获取 token

# 资源操作
kubectl get pods -A                                     # 查看所有 Pod
kubectl get svc,deploy,sts -n <namespace>              # 查看多种资源
kubectl describe pod <pod-name> -n <namespace>         # 查看详情
kubectl logs -f <pod-name> -n <namespace>              # 查看日志
kubectl exec -it <pod-name> -- /bin/sh                 # 进入容器

# 调试诊断
kubectl top nodes                                       # 资源使用
kubectl get events -n <namespace> --sort-by='.lastTimestamp'  # 事件
kubectl debug node/<node-name> -it --image=ubuntu      # 节点调试
kubectl run debug --image=busybox --rm -it -- sh       # 临时 Pod

# 备份恢复
sudo k3s etcd-snapshot save --name backup-$(date +%F)  # 创建快照
sudo k3s etcd-snapshot ls                              # 列出快照
```

### 重要路径

```bash
/usr/local/bin/k3s              # K3s 二进制
/etc/rancher/k3s/               # 配置文件目录
  ├── config.yaml               # 主配置文件
  ├── k3s.yaml                  # kubeconfig
  └── registries.yaml           # 镜像仓库配置
/var/lib/rancher/k3s/           # 数据目录
  ├── server/db/                # SQLite 数据库
  ├── server/manifests/         # 自动部署清单
  └── server/tls/               # TLS 证书
/etc/systemd/system/k3s.service # systemd 服务文件
```

### 端口列表

```
6443    - Kubernetes API Server
10250   - Kubelet API
8472    - Flannel VXLAN
51820   - Flannel Wireguard (可选)
2379    - etcd (多主模式)
2380    - etcd peer (多主模式)
```

---

## 1. K3s 简介

### 1.1 什么是 K3s

**核心特点：**
- **轻量级**：二进制文件不到 100MB，内存占用约 512MB
- **简单**：单一二进制文件包含所有依赖
- **安全**：默认启用 TLS，支持 SELinux
- **生产就绪**：完全符合 CNCF Kubernetes 认证

### 1.2 适用场景

```
✅ 边缘计算节点
✅ IoT 设备管理
✅ CI/CD 流水线
✅ 开发测试环境
✅ ARM 架构设备（树莓派等）
✅ 资源受限环境
✅ 单机 Kubernetes 学习
```

---

## 2. K3s 架构与原理

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        K3s Server                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  API Server  │  │  Scheduler   │  │  Controller  │      │
│  │              │  │              │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Embedded Storage (SQLite/etcd)            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Kubelet    │  │  Kube-proxy  │  │  Containerd  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (Tunnel)
                              │
┌─────────────────────────────────────────────────────────────┐
│                        K3s Agent                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Kubelet    │  │  Kube-proxy  │  │  Containerd  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件详解

#### 2.2.1 单一进程架构

传统 Kubernetes：
```bash
# 需要多个独立进程
kube-apiserver
kube-controller-manager
kube-scheduler
kubelet
kube-proxy
etcd
```

K3s 优化：
```bash
# 所有组件打包在一个二进制文件中
k3s server  # 包含 API Server + Controller + Scheduler + 存储
k3s agent   # 包含 Kubelet + Kube-proxy
```

#### 2.2.2 嵌入式数据库

**SQLite (默认)**
- 单节点部署
- 零配置，自动初始化
- 数据存储在 `/var/lib/rancher/k3s/server/db/state.db`

**etcd (可选)**
- 多主高可用
- 内嵌或外部 etcd 集群
- 适用于生产环境

**外部数据库 (可选)**
- PostgreSQL
- MySQL
- 适用于云环境

#### 2.2.3 容器运行时

K3s 默认使用 **containerd**：
```
优势：
- 轻量级，低内存占用
- CRI 原生支持
- 移除 Docker 依赖
- 更快的镜像拉取
```

#### 2.2.4 网络组件

**Flannel (默认 CNI)**
```yaml
默认配置：
- Backend: VXLAN
- Network: 10.42.0.0/16
- 简单可靠，开箱即用
```

**Traefik (默认 Ingress)**
```yaml
特点：
- 自动服务发现
- 支持 Let's Encrypt
- Dashboard 监控
```

### 2.3 精简原理

K3s 通过以下方式减少体积和资源占用：

#### 移除组件
```
❌ Cloud Provider（云厂商特定）
❌ 存储插件（只保留必要的）
❌ Legacy API
❌ 非关键 Admission Controllers
```

#### 替换组件
```
Docker → Containerd
etcd → SQLite (可选)
iptables → nftables (可选)
```

#### 打包策略
```go
// 伪代码展示打包逻辑
func BuildK3s() {
    components := []Component{
        APIServer,
        ControllerManager,
        Scheduler,
        Kubelet,
        KubeProxy,
        Containerd,
        Flannel,
        Traefik,
    }

    // 编译为单一静态二进制
    binary := CompileStatic(components)

    // 压缩优化
    optimized := Compress(binary, UPX)

    return optimized // ~70MB
}
```

---

## 3. K3s vs K8s 对比

| 特性 | K3s | K8s |
|------|-----|-----|
| **二进制大小** | ~70MB | ~1.5GB+ |
| **内存占用** | ~512MB | ~2GB+ |
| **安装时间** | < 1 分钟 | 10-30 分钟 |
| **依赖** | 无（单一二进制） | Docker/containerd + 多个组件 |
| **默认存储** | SQLite | etcd |
| **CNI** | Flannel | 需手动安装 |
| **Ingress** | Traefik | 需手动安装 |
| **证书管理** | 自动 | 手动/kubeadm |
| **适用场景** | 边缘/单机/IoT | 大规模集群 |

---

## 4. 快速开始

### 4.1 单节点安装

```bash
# 安装 K3s Server
curl -sfL https://get.k3s.io | sh -

# 检查状态
sudo systemctl status k3s

# 查看节点
sudo k3s kubectl get nodes

# 设置 kubectl 别名
echo "alias kubectl='sudo k3s kubectl'" >> ~/.bashrc
source ~/.bashrc
```

**安装过程详解：**
```bash
# 1. 下载 k3s 二进制到 /usr/local/bin/k3s
# 2. 创建 systemd 服务 /etc/systemd/system/k3s.service
# 3. 生成 kubeconfig 到 /etc/rancher/k3s/k3s.yaml
# 4. 启动服务并设置开机自启
# 5. 等待所有系统 Pod 运行
```

### 4.2 高可用多主安装

```bash
# 第一个主节点（初始化 etcd）
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --tls-san=k3s-lb.example.com

# 获取 token
sudo cat /var/lib/rancher/k3s/server/node-token

# 第二、三个主节点（加入集群）
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://first-server:6443 \
  --token=K10xxx...

# 添加 Agent 节点
curl -sfL https://get.k3s.io | K3S_URL=https://k3s-lb.example.com:6443 \
  K3S_TOKEN=K10xxx... sh -
```

### 4.3 使用外部数据库

```bash
# PostgreSQL
curl -sfL https://get.k3s.io | sh -s - server \
  --datastore-endpoint="postgres://user:pass@hostname:5432/k3s"

# MySQL
curl -sfL https://get.k3s.io | sh -s - server \
  --datastore-endpoint="mysql://user:pass@tcp(hostname:3306)/k3s"
```

### 4.4 配置文件方式

```yaml
# /etc/rancher/k3s/config.yaml
write-kubeconfig-mode: "0644"
tls-san:
  - "k3s.example.com"
  - "192.168.1.100"
cluster-cidr: "10.42.0.0/16"
service-cidr: "10.43.0.0/16"
cluster-dns: "10.43.0.10"
disable:
  - traefik
  - servicelb
node-label:
  - "environment=production"
  - "region=us-west"
```

```bash
# 使用配置文件安装
curl -sfL https://get.k3s.io | sh -
```

---

## 5. 核心概念

### 5.1 Server vs Agent

**K3s Server（主节点）**
```
包含组件：
✓ API Server
✓ Controller Manager
✓ Scheduler
✓ 数据存储
✓ Kubelet
✓ Kube-proxy

角色：
- 集群控制平面
- 运行系统 Pod
- 可同时作为 Worker
```

**K3s Agent（工作节点）**
```
包含组件：
✓ Kubelet
✓ Kube-proxy
✓ Containerd

角色：
- 运行应用负载
- 接收 Server 调度
```

### 5.2 数据存储路径

```bash
# K3s 核心数据目录
/var/lib/rancher/k3s/
├── server/
│   ├── db/              # SQLite 数据库
│   ├── tls/             # TLS 证书
│   ├── manifests/       # 自动部署的清单
│   ├── token            # 集群 token
│   └── node-token       # 节点加入 token
├── agent/
│   ├── containerd/      # 容器数据
│   ├── images/          # 镜像缓存
│   └── pod-manifests/   # 静态 Pod
└── storage/             # 本地 PV 存储

# Kubeconfig
/etc/rancher/k3s/k3s.yaml

# 日志
journalctl -u k3s -f
```

### 5.3 网络模型

```
Pod Network (Flannel VXLAN):
┌─────────────────────────────────────┐
│  Node1: 10.42.0.0/24                │
│  ┌────┐  ┌────┐  ┌────┐            │
│  │Pod1│  │Pod2│  │Pod3│            │
│  └────┘  └────┘  └────┘            │
└─────────────────────────────────────┘
         │
         │ VXLAN Tunnel (Port 8472)
         │
┌─────────────────────────────────────┐
│  Node2: 10.42.1.0/24                │
│  ┌────┐  ┌────┐                     │
│  │Pod4│  │Pod5│                     │
│  └────┘  └────┘                     │
└─────────────────────────────────────┘

Service Network:
  10.43.0.0/16 (ClusterIP)

NodePort Range:
  30000-32767
```

---

## 6. 高级配置

### 6.1 自定义 CNI

```bash
# 禁用默认 Flannel，使用 Calico
curl -sfL https://get.k3s.io | sh -s - --flannel-backend=none \
  --disable-network-policy

# 安装 Calico
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

### 6.2 私有镜像仓库

```bash
# /etc/rancher/k3s/registries.yaml
mirrors:
  docker.io:
    endpoint:
      - "https://registry.example.com"
  registry.example.com:
    endpoint:
      - "https://registry.example.com"

configs:
  "registry.example.com":
    auth:
      username: admin
      password: password
    tls:
      cert_file: /path/to/cert.crt
      key_file: /path/to/cert.key
      ca_file: /path/to/ca.crt
```

```bash
# 重启 K3s 使配置生效
sudo systemctl restart k3s
```

### 6.3 自动部署清单

K3s 会自动部署 `/var/lib/rancher/k3s/server/manifests/` 下的 YAML 文件：

```bash
# /var/lib/rancher/k3s/server/manifests/my-app.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: my-system
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-daemon
  namespace: my-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-daemon
  template:
    metadata:
      labels:
        app: my-daemon
    spec:
      containers:
      - name: daemon
        image: my-image:latest
```

**注意：** 删除该文件会自动删除资源！

### 6.4 资源限制

```yaml
# /etc/rancher/k3s/config.yaml
kubelet-arg:
  - "max-pods=50"
  - "eviction-hard=memory.available<500Mi"
  - "eviction-hard=nodefs.available<10%"
  - "kube-reserved=cpu=200m,memory=500Mi"
  - "system-reserved=cpu=200m,memory=500Mi"
```

### 6.5 备份与恢复

```bash
# 备份（SQLite）
sudo cp /var/lib/rancher/k3s/server/db/state.db \
  /backup/k3s-state-$(date +%F).db

# 备份（etcd）
sudo k3s etcd-snapshot save --name backup-$(date +%F)

# 列出快照
sudo k3s etcd-snapshot ls

# 恢复
sudo k3s server \
  --cluster-reset \
  --cluster-reset-restore-path=/var/lib/rancher/k3s/server/db/snapshots/backup-2024-01-01
```

---

## 7. 复杂实战案例：微服务电商平台

### 7.0 架构概述

本案例构建一个**生产级微服务电商平台**，完整展示 K3s 的企业应用能力。

**技术栈：**
```
前端层：React SPA + Nginx
网关层：Traefik Ingress（K3s 默认）
服务层：用户服务(Go) + 商品服务(Node.js) + 订单服务(Python)
中间件：PostgreSQL + Redis + RabbitMQ
监控层：Prometheus + Grafana + Metrics Server
```

**系统架构：**
```
                    ┌──────────────┐
                    │   Internet   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Traefik    │ (Ingress Controller)
                    │  LoadBalancer│
                    └──────┬───────┘
                           │
        ┏━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━┓
        ▼                                    ▼
┌───────────────┐                   ┌────────────────┐
│   Frontend    │                   │  API Services  │
│  (React SPA)  │                   │                │
└───────────────┘                   │ ┌────────────┐ │
                                    │ │User Service│ │
                                    │ └────────────┘ │
                                    │ ┌────────────┐ │
                                    │ │Prod Service│ │
                                    │ └────────────┘ │
                                    │ ┌────────────┐ │
                                    │ │Order Svc   │ │
                                    │ └────────────┘ │
                                    └────────┬───────┘
                                             │
                          ┏━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━┓
                          ▼                  ▼                ▼
                  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                  │ PostgreSQL   │  │    Redis     │  │  RabbitMQ    │
                  │  (Database)  │  │   (Cache)    │  │ (Message Q)  │
                  └──────────────┘  └──────────────┘  └──────────────┘
```

**部署拓扑：**
- 3 节点高可用 K3s 集群（嵌入式 etcd）
- 跨命名空间隔离（prod、middleware、monitoring）
- 自动扩缩容（HPA）
- 滚动更新零停机

### 7.1 集群初始化

```bash
# 三节点高可用集群（嵌入式 etcd）
# node1 (Master 1)
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --tls-san=k3s.ecommerce.local \
  --write-kubeconfig-mode=644 \
  --disable=servicelb

# 等待第一个节点就绪
sudo k3s kubectl get nodes

# 获取 token（在 node1 上执行）
NODE_TOKEN=$(sudo cat /var/lib/rancher/k3s/server/node-token)
echo $NODE_TOKEN  # 复制此 token

# node2 (Master 2) - 使用上面获取的 token
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://node1:6443 \
  --token=K10xxx... \
  --tls-san=k3s.ecommerce.local

# node3 (Master 3)
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://node1:6443 \
  --token=K10xxx... \
  --tls-san=k3s.ecommerce.local

# 验证集群状态
sudo k3s kubectl get nodes
# 应该看到 3 个 master 节点，都是 Ready 状态

# 安装 Metrics Server（HPA 必需）
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 配置 Metrics Server（K3s 需要禁用 TLS 验证）
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

### 7.2 项目结构与准备

#### 7.2.1 目录结构

```bash
k3s-ecommerce/
├── infrastructure/          # 基础设施配置
│   ├── namespaces.yaml     # 命名空间定义
│   ├── secrets.yaml        # 核心密钥配置
│   ├── rbac.yaml          # RBAC 权限配置
│   ├── storage-class.yaml  # 存储类配置
│   └── network-policies.yaml  # 网络策略
├── middleware/             # 中间件层
│   ├── postgresql/         # 数据库
│   │   └── statefulset.yaml
│   ├── redis/              # 缓存
│   │   └── deployment.yaml
│   └── rabbitmq/           # 消息队列
│       └── statefulset.yaml
├── services/               # 微服务层
│   ├── user-service/       # 用户服务
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml
│   │   └── configmap.yaml
│   ├── product-service/    # 商品服务
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── order-service/      # 订单服务
│       ├── deployment.yaml
│       └── service.yaml
├── gateway/                # 网关层
│   └── ingress.yaml        # Ingress 路由配置
├── frontend/               # 前端
│   ├── deployment.yaml
│   └── service.yaml
├── monitoring/             # 监控系统
│   ├── prometheus/
│   │   └── deployment.yaml
│   └── grafana/
│       └── deployment.yaml
├── deploy.sh               # 一键部署脚本
└── README.md               # 部署说明
```

#### 7.2.2 快速开始

```bash
# 1. 创建项目目录
mkdir -p k3s-ecommerce/{infrastructure,middleware/{postgresql,redis,rabbitmq},services/{user-service,product-service,order-service},gateway,frontend,monitoring/{prometheus,grafana}}

cd k3s-ecommerce

# 2. 将下面各节的 YAML 内容保存到对应文件

# 3. 创建部署脚本
cat > deploy.sh << 'EOF'
# ... (部署脚本内容见 7.9 节)
EOF

chmod +x deploy.sh

# 4. 执行部署
./deploy.sh

# 5. 配置本地 hosts（macOS/Linux）
sudo bash -c 'cat >> /etc/hosts << EOF
127.0.0.1  ecommerce.local
127.0.0.1  grafana.local
127.0.0.1  prometheus.local
EOF'

# Windows 用户编辑: C:\Windows\System32\drivers\etc\hosts
```

#### 7.2.3 前置要求

```bash
# 系统要求
- 最低 2 核 4GB 内存
- 推荐 4 核 8GB 内存（用于完整测试）
- 20GB 可用磁盘空间

# 软件要求
- K3s v1.27+
- kubectl 客户端
- curl (用于测试)

# 验证环境
kubectl version
kubectl get nodes
kubectl cluster-info
```

### 7.3 基础设施配置

#### 7.3.1 命名空间

```yaml
# infrastructure/namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-prod
  labels:
    environment: production
---
apiVersion: v1
kind: Namespace
metadata:
  name: ecommerce-middleware
  labels:
    tier: middleware
---
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    name: monitoring
```

#### 7.3.2 核心 Secrets

```yaml
# infrastructure/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-config
  namespace: ecommerce-prod
type: Opaque
stringData:
  user-db-url: "postgresql://ecommerce_user:ChangeMe123!@postgresql.ecommerce-middleware:5432/users"
  product-db-url: "postgresql://ecommerce_user:ChangeMe123!@postgresql.ecommerce-middleware:5432/products"
  order-db-url: "postgresql://ecommerce_user:ChangeMe123!@postgresql.ecommerce-middleware:5432/orders"
---
apiVersion: v1
kind: Secret
metadata:
  name: jwt-secret
  namespace: ecommerce-prod
type: Opaque
stringData:
  secret: "your-super-secret-jwt-key-change-in-production"
---
apiVersion: v1
kind: Secret
metadata:
  name: grafana-secret
  namespace: monitoring
type: Opaque
stringData:
  admin-password: "admin123"
```

#### 7.3.3 RBAC 配置

```yaml
# infrastructure/rbac.yaml
# Prometheus ServiceAccount 和权限
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
- apiGroups: [""]
  resources:
  - nodes
  - nodes/proxy
  - services
  - endpoints
  - pods
  verbs: ["get", "list", "watch"]
- apiGroups:
  - extensions
  resources:
  - ingresses
  verbs: ["get", "list", "watch"]
- nonResourceURLs: ["/metrics"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: monitoring
```

#### 7.3.4 存储类

```yaml

```yaml
# infrastructure/storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-path
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Retain
```

```yaml
# infrastructure/network-policies.yaml
# 注意：仅用于演示网络策略概念，生产环境需要更精细的规则

# 允许服务访问中间件命名空间的数据库和缓存
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-prod
  namespace: ecommerce-middleware
spec:
  podSelector:
    matchLabels:
      tier: database
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          environment: production
    ports:
    - protocol: TCP
      port: 5432
    - protocol: TCP
      port: 6379
    - protocol: TCP
      port: 5672
---
# 允许所有 Egress（简化配置）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-all-egress
  namespace: ecommerce-prod
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - {}
---
# 允许 Ingress 控制器访问服务
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-services
  namespace: ecommerce-prod
spec:
  podSelector:
    matchLabels:
      tier: frontend
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: TCP
      port: 80
```

### 7.4 中间件部署

```yaml
# middleware/postgresql/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgresql
  namespace: ecommerce-middleware
spec:
  serviceName: postgresql
  replicas: 1
  selector:
    matchLabels:
      app: postgresql
  template:
    metadata:
      labels:
        app: postgresql
        tier: database
    spec:
      containers:
      - name: postgresql
        image: postgres:15-alpine
        env:
        - name: POSTGRES_DB
          value: ecommerce
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
          name: postgresql
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - postgres
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - postgres
          initialDelaySeconds: 5
          periodSeconds: 5
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgresql
  namespace: ecommerce-middleware
spec:
  selector:
    app: postgresql
  ports:
  - port: 5432
    targetPort: 5432
  clusterIP: None
---
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: ecommerce-middleware
type: Opaque
stringData:
  username: ecommerce_user
  password: "ChangeMe123!"
```

```yaml
# middleware/redis/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: ecommerce-middleware
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
        tier: cache
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command:
        - redis-server
        - --appendonly yes
        - --requirepass $(REDIS_PASSWORD)
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: data
          mountPath: /data
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
      volumes:
      - name: data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: ecommerce-middleware
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
---
apiVersion: v1
kind: Secret
metadata:
  name: redis-secret
  namespace: ecommerce-middleware
type: Opaque
stringData:
  password: "RedisPass123!"
```

```yaml
# middleware/rabbitmq/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: ecommerce-middleware
spec:
  serviceName: rabbitmq
  replicas: 1
  selector:
    matchLabels:
      app: rabbitmq
  template:
    metadata:
      labels:
        app: rabbitmq
        tier: messaging
    spec:
      containers:
      - name: rabbitmq
        image: rabbitmq:3.12-management-alpine
        env:
        - name: RABBITMQ_DEFAULT_USER
          value: admin
        - name: RABBITMQ_DEFAULT_PASS
          valueFrom:
            secretKeyRef:
              name: rabbitmq-secret
              key: password
        ports:
        - containerPort: 5672
          name: amqp
        - containerPort: 15672
          name: management
        volumeMounts:
        - name: data
          mountPath: /var/lib/rabbitmq
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "400m"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 5Gi
---
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: ecommerce-middleware
spec:
  selector:
    app: rabbitmq
  ports:
  - port: 5672
    targetPort: 5672
    name: amqp
  - port: 15672
    targetPort: 15672
    name: management
---
apiVersion: v1
kind: Secret
metadata:
  name: rabbitmq-secret
  namespace: ecommerce-middleware
type: Opaque
stringData:
  password: "RabbitPass123!"
```

### 7.5 微服务部署

```yaml
# services/user-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: ecommerce-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
        tier: backend
        version: v1
    spec:
      containers:
      - name: user-service
        image: your-registry/user-service:1.0.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-config
              key: user-db-url
        - name: REDIS_URL
          value: redis://redis.ecommerce-middleware:6379
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: user-service-config
              key: log_level
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 9090
          name: metrics
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: ecommerce-prod
  labels:
    app: user-service
spec:
  selector:
    app: user-service
  ports:
  - port: 80
    targetPort: 8080
    name: http
  - port: 9090
    targetPort: 9090
    name: metrics
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: user-service-config
  namespace: ecommerce-prod
data:
  log_level: "info"
  rate_limit: "100"
  cache_ttl: "3600"
```

```yaml
# services/user-service/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
  namespace: ecommerce-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 2
        periodSeconds: 30
      selectPolicy: Max
```

```yaml
# services/product-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
  namespace: ecommerce-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: product-service
  template:
    metadata:
      labels:
        app: product-service
        tier: backend
        version: v1
    spec:
      containers:
      - name: product-service
        image: your-registry/product-service:1.0.0
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-config
              key: product-db-url
        - name: REDIS_URL
          value: redis://redis.ecommerce-middleware:6379
        - name: ELASTICSEARCH_URL
          value: http://elasticsearch:9200
        ports:
        - containerPort: 3000
          name: http
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: product-service
  namespace: ecommerce-prod
spec:
  selector:
    app: product-service
  ports:
  - port: 80
    targetPort: 3000
```

```yaml
# services/order-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: ecommerce-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
        tier: backend
        version: v1
    spec:
      containers:
      - name: order-service
        image: your-registry/order-service:1.0.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-config
              key: order-db-url
        - name: RABBITMQ_URL
          value: amqp://admin:RabbitPass123!@rabbitmq.ecommerce-middleware:5672
        - name: PAYMENT_SERVICE_URL
          value: http://payment-service
        ports:
        - containerPort: 8000
          name: http
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: ecommerce-prod
spec:
  selector:
    app: order-service
  ports:
  - port: 80
    targetPort: 8000
```

### 7.6 Ingress 配置（使用 Traefik）

K3s 默认集成 Traefik，我们使用 IngressRoute 配置路由和中间件。

```yaml
# gateway/ingress.yaml
# 主应用 Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-ingress
  namespace: ecommerce-prod
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
    traefik.ingress.kubernetes.io/router.middlewares: ecommerce-prod-rate-limit@kubernetescrd
spec:
  rules:
  - host: ecommerce.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
      - path: /api/users
        pathType: Prefix
        backend:
          service:
            name: user-service
            port:
              number: 80
      - path: /api/products
        pathType: Prefix
        backend:
          service:
            name: product-service
            port:
              number: 80
      - path: /api/orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
---
# Traefik 中间件 - 限流
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
  namespace: ecommerce-prod
spec:
  rateLimit:
    average: 100
    burst: 50
---
# Traefik 中间件 - CORS
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: cors
  namespace: ecommerce-prod
spec:
  headers:
    accessControlAllowMethods:
      - GET
      - POST
      - PUT
      - DELETE
    accessControlAllowOriginList:
      - "*"
    accessControlMaxAge: 100
    addVaryHeader: true
---
# 监控 Dashboard Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monitoring-ingress
  namespace: monitoring
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  rules:
  - host: grafana.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: grafana
            port:
              number: 3000
  - host: prometheus.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prometheus
            port:
              number: 9090
```

### 7.7 前端部署

```yaml
# frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: ecommerce-prod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
        tier: frontend
    spec:
      containers:
      - name: nginx
        image: your-registry/ecommerce-frontend:1.0.0
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: ecommerce-prod
data:
  nginx.conf: |
    user nginx;
    worker_processes auto;

    events {
      worker_connections 1024;
    }

    http {
      include /etc/nginx/mime.types;
      default_type application/octet-stream;

      gzip on;
      gzip_types text/plain text/css application/json application/javascript;

      server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        location / {
          try_files $uri $uri/ /index.html;
        }

        # API 请求通过 Ingress 路由，前端只需提供静态文件
        location /api {
          return 404 "API should be accessed via ingress";
        }
      }
    }
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: ecommerce-prod
spec:
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
```

**注意：** Ingress 配置已在 `gateway/ingress.yaml` 中统一定义。

### 7.8 监控系统

```yaml
# monitoring/prometheus/deployment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s

    scrape_configs:
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
        - role: pod
        relabel_configs:
        - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
          action: keep
          regex: true
        - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
          action: replace
          target_label: __metrics_path__
          regex: (.+)
        - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
          action: replace
          regex: ([^:]+)(?::\d+)?;(\d+)
          replacement: $1:$2
          target_label: __address__

      - job_name: 'user-service'
        static_configs:
        - targets: ['user-service.ecommerce-prod:9090']

      - job_name: 'apisix'
        static_configs:
        - targets: ['apisix.ecommerce-prod:9091']
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
      - name: prometheus
        image: prom/prometheus:v2.48.0
        args:
        - '--config.file=/etc/prometheus/prometheus.yml'
        - '--storage.tsdb.path=/prometheus'
        - '--storage.tsdb.retention.time=30d'
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: config
          mountPath: /etc/prometheus
        - name: data
          mountPath: /prometheus
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
      volumes:
      - name: config
        configMap:
          name: prometheus-config
      - name: data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: monitoring
spec:
  selector:
    app: prometheus
  ports:
  - port: 9090
    targetPort: 9090
```

```yaml
# monitoring/grafana/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:10.2.0
        env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: grafana-secret
              key: admin-password
        - name: GF_INSTALL_PLUGINS
          value: "grafana-piechart-panel"
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: data
          mountPath: /var/lib/grafana
        - name: datasources
          mountPath: /etc/grafana/provisioning/datasources
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: data
        emptyDir: {}
      - name: datasources
        configMap:
          name: grafana-datasources
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: monitoring
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      access: proxy
      url: http://prometheus:9090
      isDefault: true
    - name: Loki
      type: loki
      access: proxy
      url: http://loki:3100
---
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: monitoring
spec:
  selector:
    app: grafana
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

### 7.9 部署脚本

```bash
#!/bin/bash
# deploy.sh - 完整部署脚本

set -e

echo "🚀 开始部署 K3s 电商平台"
echo "================================"

# 检查 kubectl 可用性
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl 未安装或不在 PATH 中"
    exit 1
fi

# 1. 创建命名空间
echo ""
echo "📦 步骤 1/8: 创建命名空间..."
kubectl apply -f infrastructure/namespaces.yaml

# 2. 创建 RBAC 和 Secrets
echo ""
echo "🔐 步骤 2/8: 配置 RBAC 和 Secrets..."
kubectl apply -f infrastructure/rbac.yaml
kubectl apply -f infrastructure/secrets.yaml

# 3. 配置存储和网络
echo ""
echo "💾 步骤 3/8: 配置存储类和网络策略..."
kubectl apply -f infrastructure/storage-class.yaml
kubectl apply -f infrastructure/network-policies.yaml

# 4. 部署中间件
echo ""
echo "🗄️  步骤 4/8: 部署数据库和消息队列..."
kubectl apply -f middleware/postgresql/
kubectl apply -f middleware/redis/
kubectl apply -f middleware/rabbitmq/

# 等待中间件就绪
echo "⏳ 等待中间件启动..."
kubectl wait --for=condition=ready pod -l app=postgresql -n ecommerce-middleware --timeout=300s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=redis -n ecommerce-middleware --timeout=300s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=rabbitmq -n ecommerce-middleware --timeout=300s 2>/dev/null || true

echo "✅ 中间件部署完成"

# 5. 部署微服务
echo ""
echo "🔧 步骤 5/8: 部署微服务..."
kubectl apply -f services/user-service/
kubectl apply -f services/product-service/
kubectl apply -f services/order-service/

# 等待服务就绪
echo "⏳ 等待服务启动..."
sleep 10

# 6. 部署前端
echo ""
echo "🎨 步骤 6/8: 部署前端..."
kubectl apply -f frontend/

# 7. 配置 Ingress
echo ""
echo "🌐 步骤 7/8: 配置 Ingress 路由..."
kubectl apply -f gateway/ingress.yaml

# 8. 部署监控
echo ""
echo "📊 步骤 8/8: 部署监控系统..."
kubectl apply -f monitoring/prometheus/
kubectl apply -f monitoring/grafana/

echo ""
echo "✅ 部署完成！"
echo "================================"
echo ""
echo "📋 访问信息："
echo "--------------------------------"
echo "需要在 /etc/hosts 添加以下记录："
echo ""
echo "127.0.0.1  ecommerce.local"
echo "127.0.0.1  grafana.local"
echo "127.0.0.1  prometheus.local"
echo ""
echo "访问地址："
echo "  🌍 前端: http://ecommerce.local"
echo "  📊 Grafana: http://grafana.local (admin/admin123)"
echo "  📈 Prometheus: http://prometheus.local"
echo ""
echo "检查部署状态："
echo "  kubectl get pods -n ecommerce-prod"
echo "  kubectl get pods -n ecommerce-middleware"
echo "  kubectl get pods -n monitoring"
echo ""
echo "查看 Traefik Dashboard:"
echo "  kubectl port-forward -n kube-system \$(kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik -o name) 9000:9000"
echo "  访问: http://localhost:9000/dashboard/"
```

### 7.10 架构决策说明

#### 为什么选择这些技术？

**1. 使用 Traefik 而非其他 Ingress Controller**
- ✅ K3s 默认集成，零配置即可使用
- ✅ 支持动态配置，无需重启
- ✅ 原生支持 Kubernetes CRD（Middleware、IngressRoute）
- ✅ 内置 Dashboard 和 Metrics
- ✅ 资源占用低（~50MB 内存）

**2. PostgreSQL 单实例部署**
- 本 demo 侧重展示 K8s 部署，数据库高可用需要 Patroni/Stolon 等复杂方案
- 生产环境建议：
  - 使用云数据库（RDS/Cloud SQL）
  - 或部署 PostgreSQL Operator（Zalando、Crunchy Data）

**3. Redis 单实例 + emptyDir**
- 缓存数据可以丢失，重启后重建
- 生产环境使用：
  - Redis Sentinel（高可用）
  - Redis Cluster（分片）
  - 持久化存储（PVC）

**4. 不使用服务网格（Istio/Linkerd）**
- 本案例规模较小，服务网格会增加复杂度
- Traefik Middleware 已满足基本需求（限流、重试、CORS）
- 大规模微服务（50+ 服务）才考虑服务网格

**5. Metrics Server vs Prometheus Adapter**
- Metrics Server：提供基础 CPU/内存指标，足够简单 HPA
- Prometheus Adapter：支持自定义指标（QPS、延迟等）
- 本案例使用 Metrics Server，简单实用

#### 成本优化建议

```yaml
# 资源限制建议（生产环境）
小型部署（< 1000 用户）:
  - 微服务: requests: 100m/128Mi, limits: 200m/256Mi
  - 数据库: requests: 500m/1Gi, limits: 1/2Gi
  - 总需求: 4 核 8GB

中型部署（< 10000 用户）:
  - 微服务: requests: 200m/256Mi, limits: 500m/512Mi
  - 数据库: requests: 1/2Gi, limits: 2/4Gi
  - 总需求: 8 核 16GB

大型部署（> 10000 用户）:
  - 使用 HPA 自动扩容
  - 分离数据库到独立集群
  - 考虑多区域部署
```

### 7.11 验证和测试

#### 部署验证

```bash
# 检查所有 Pod 状态
kubectl get pods -A

# 查看 Ingress 配置
kubectl get ingress -A

# 检查 Traefik 状态
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# 查看服务暴露情况
kubectl get svc -n ecommerce-prod
kubectl get svc -n ecommerce-middleware
kubectl get svc -n monitoring
```

#### 功能测试

```bash
# 1. 测试用户服务（内部访问）
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://user-service.ecommerce-prod/health

# 2. 测试产品服务
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://product-service.ecommerce-prod/health

# 3. 测试订单服务
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://order-service.ecommerce-prod/health

# 4. 测试通过 Ingress 访问（需要先配置 hosts）
# 在宿主机添加: 127.0.0.1 ecommerce.local
curl http://ecommerce.local/

# 5. 测试 API 路由
curl http://ecommerce.local/api/users/health
curl http://ecommerce.local/api/products/health
curl http://ecommerce.local/api/orders/health
```

#### 查看日志

```bash
# 查看微服务日志
kubectl logs -f deployment/user-service -n ecommerce-prod
kubectl logs -f deployment/product-service -n ecommerce-prod
kubectl logs -f deployment/order-service -n ecommerce-prod

# 查看中间件日志
kubectl logs -f statefulset/postgresql -n ecommerce-middleware
kubectl logs -f deployment/redis -n ecommerce-middleware
kubectl logs -f statefulset/rabbitmq -n ecommerce-middleware

# 查看 Traefik 日志
kubectl logs -f -n kube-system -l app.kubernetes.io/name=traefik
```

#### 性能监控

```bash
# 查看资源使用（需要 Metrics Server）
kubectl top nodes
kubectl top pods -n ecommerce-prod
kubectl top pods -n ecommerce-middleware

# 查看 HPA 状态
kubectl get hpa -n ecommerce-prod

# 查看 HPA 详情
kubectl describe hpa user-service-hpa -n ecommerce-prod
```

#### 压力测试

```bash
# 安装测试工具
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: loadtest
  namespace: ecommerce-prod
spec:
  containers:
  - name: wrk
    image: williamyeh/wrk
    command: ["sleep", "3600"]
EOF

# 等待 Pod 就绪
kubectl wait --for=condition=ready pod/loadtest -n ecommerce-prod

# 执行压力测试
kubectl exec -it loadtest -n ecommerce-prod -- \
  wrk -t4 -c100 -d30s http://user-service/health

# 测试 Ingress（从集群外部）
# 需要在宿主机执行
wrk -t4 -c100 -d30s http://ecommerce.local/api/products

# 清理测试 Pod
kubectl delete pod loadtest -n ecommerce-prod
```

#### 监控访问

```bash
# 方法 1：通过 Ingress 访问（推荐）
# 浏览器打开 http://grafana.local
# 用户名: admin, 密码: admin123

# 方法 2：通过 Port-forward 访问
kubectl port-forward -n monitoring svc/grafana 3000:3000
# 访问 http://localhost:3000

kubectl port-forward -n monitoring svc/prometheus 9090:9090
# 访问 http://localhost:9090
```

#### 故障模拟测试

```bash
# 1. 删除一个 Pod，测试自动恢复
kubectl delete pod -n ecommerce-prod -l app=user-service --force
kubectl get pods -n ecommerce-prod -w

# 2. 模拟高负载，测试 HPA
kubectl exec -it loadtest -n ecommerce-prod -- \
  wrk -t8 -c200 -d300s http://user-service/health

# 观察扩容过程
kubectl get hpa -n ecommerce-prod -w

# 3. 测试数据库连接
kubectl run -it --rm psql --image=postgres:15-alpine --restart=Never -- \
  psql -h postgresql.ecommerce-middleware -U ecommerce_user -d users

# 4. 测试 Redis 连接
kubectl run -it --rm redis-cli --image=redis:7-alpine --restart=Never -- \
  redis-cli -h redis.ecommerce-middleware -a RedisPass123!
```

### 7.12 常见问题（FAQ）

#### Q1: 为什么 Pod 一直处于 Pending 状态？

```bash
# 查看原因
kubectl describe pod <pod-name> -n <namespace>

# 常见原因：
# 1. 资源不足
kubectl top nodes  # 查看节点资源

# 2. PVC 未绑定
kubectl get pvc -A

# 3. 镜像拉取失败
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

#### Q2: 服务之间无法通信？

```bash
# 1. 检查网络策略
kubectl get networkpolicy -A

# 2. 测试 DNS 解析
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  nslookup user-service.ecommerce-prod

# 3. 测试服务连通性
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://user-service.ecommerce-prod/health

# 4. 检查 Service 端点
kubectl get endpoints -n ecommerce-prod
```

#### Q3: HPA 不工作？

```bash
# 1. 检查 Metrics Server
kubectl get deployment metrics-server -n kube-system
kubectl top nodes  # 应该有输出

# 2. 检查 HPA 状态
kubectl get hpa -A
kubectl describe hpa user-service-hpa -n ecommerce-prod

# 3. 确保 Pod 设置了 resources.requests
kubectl get pod <pod-name> -n ecommerce-prod -o yaml | grep -A 5 resources
```

#### Q4: Ingress 无法访问？

```bash
# 1. 检查 Traefik 状态
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# 2. 查看 Ingress 配置
kubectl get ingress -A
kubectl describe ingress ecommerce-ingress -n ecommerce-prod

# 3. 检查 Service
kubectl get svc -n kube-system traefik

# 4. 测试端口转发
kubectl port-forward -n kube-system svc/traefik 8080:80
curl http://localhost:8080
```

#### Q5: 如何清理整个项目？

```bash
# 删除所有资源
kubectl delete namespace ecommerce-prod
kubectl delete namespace ecommerce-middleware
kubectl delete namespace monitoring

# 或使用脚本
cat > cleanup.sh << 'EOF'
#!/bin/bash
echo "⚠️  警告：将删除所有项目资源！"
read -p "确认继续？(yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "取消操作"
    exit 0
fi

echo "删除命名空间..."
kubectl delete namespace ecommerce-prod --grace-period=0 --force
kubectl delete namespace ecommerce-middleware --grace-period=0 --force
kubectl delete namespace monitoring --grace-period=0 --force

echo "清理 PVC（如果存在）"
kubectl delete pvc --all -n ecommerce-prod
kubectl delete pvc --all -n ecommerce-middleware

echo "✅ 清理完成"
EOF

chmod +x cleanup.sh
./cleanup.sh
```

#### Q6: 如何更新服务镜像？

```bash
# 方法 1：直接设置镜像
kubectl set image deployment/user-service \
  user-service=your-registry/user-service:1.1.0 \
  -n ecommerce-prod

# 方法 2：编辑 Deployment
kubectl edit deployment user-service -n ecommerce-prod

# 方法 3：应用新的 YAML
kubectl apply -f services/user-service/deployment.yaml

# 查看滚动更新状态
kubectl rollout status deployment/user-service -n ecommerce-prod

# 回滚到上一版本
kubectl rollout undo deployment/user-service -n ecommerce-prod
```

#### Q7: 如何备份数据？

```bash
# PostgreSQL 备份
kubectl exec -it postgresql-0 -n ecommerce-middleware -- \
  pg_dump -U ecommerce_user users > backup-users-$(date +%F).sql

# Redis 备份
kubectl exec -it redis-xxx -n ecommerce-middleware -- \
  redis-cli -a RedisPass123! --rdb /tmp/dump.rdb save

kubectl cp ecommerce-middleware/redis-xxx:/tmp/dump.rdb ./redis-backup.rdb

# RabbitMQ 备份（导出定义）
kubectl exec -it rabbitmq-0 -n ecommerce-middleware -- \
  rabbitmqctl export_definitions /tmp/definitions.json

kubectl cp ecommerce-middleware/rabbitmq-0:/tmp/definitions.json ./rabbitmq-definitions.json
```

---

## 8. 生产环境最佳实践

### 8.1 高可用配置

```bash
# 3 个 Server 节点 + 3 个 Agent 节点
# Server 节点部署
for i in 1 2 3; do
  ssh node$i "curl -sfL https://get.k3s.io | sh -s - server \
    --cluster-init \
    --tls-san=k3s-lb.prod.com \
    --disable=traefik \
    --disable=servicelb \
    --node-taint CriticalAddonsOnly=true:NoExecute"
done

# Agent 节点部署
for i in 4 5 6; do
  ssh node$i "curl -sfL https://get.k3s.io | K3S_URL=https://k3s-lb.prod.com:6443 \
    K3S_TOKEN=xxx sh -"
done
```

### 8.2 资源预留

```yaml
# /etc/rancher/k3s/config.yaml
kubelet-arg:
  - "kube-reserved=cpu=500m,memory=1Gi,ephemeral-storage=1Gi"
  - "system-reserved=cpu=500m,memory=1Gi,ephemeral-storage=1Gi"
  - "eviction-hard=memory.available<500Mi,nodefs.available<10%"
```

### 8.3 安全加固

```bash
# 禁用不必要的端口
firewall-cmd --permanent --add-port=6443/tcp  # API Server
firewall-cmd --permanent --add-port=10250/tcp # Kubelet
firewall-cmd --reload

# SELinux 支持
semanage fcontext -a -t container_runtime_exec_t /usr/local/bin/k3s
restorecon -v /usr/local/bin/k3s

# 启用审计日志
# /etc/rancher/k3s/config.yaml
kube-apiserver-arg:
  - "audit-log-path=/var/log/k3s-audit.log"
  - "audit-log-maxage=30"
  - "audit-log-maxbackup=10"
  - "audit-log-maxsize=100"
```

### 8.4 监控告警

```yaml
# Prometheus AlertManager 规则
groups:
- name: k3s-alerts
  rules:
  - alert: NodeDown
    expr: up{job="kubernetes-nodes"} == 0
    for: 5m
    annotations:
      summary: "Node {{ $labels.instance }} is down"

  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
    for: 10m
    annotations:
      summary: "High memory usage on {{ $labels.instance }}"

  - alert: PodCrashLooping
    expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
    annotations:
      summary: "Pod {{ $labels.pod }} is crash looping"
```

### 8.5 备份策略

```bash
# 自动备份脚本
cat > /usr/local/bin/k3s-backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR=/backup/k3s
DATE=$(date +%Y%m%d-%H%M%S)

# etcd 快照
k3s etcd-snapshot save --name snapshot-$DATE

# 备份配置
tar czf $BACKUP_DIR/config-$DATE.tar.gz \
  /etc/rancher/k3s \
  /var/lib/rancher/k3s/server/manifests

# 清理旧备份（保留 7 天）
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

# 上传到对象存储
aws s3 cp $BACKUP_DIR/snapshot-$DATE s3://k3s-backups/
EOF

chmod +x /usr/local/bin/k3s-backup.sh

# Cron 定时任务
echo "0 2 * * * /usr/local/bin/k3s-backup.sh" | crontab -
```

---

## 9. 故障排查

### 9.1 常见问题

**问题 1：节点无法加入集群**
```bash
# 检查防火墙
sudo firewall-cmd --list-all

# 检查 token
sudo cat /var/lib/rancher/k3s/server/node-token

# 查看 agent 日志
sudo journalctl -u k3s-agent -f
```

**问题 2：Pod 无法启动**
```bash
# 查看 Pod 事件
kubectl describe pod <pod-name>

# 查看容器日志
kubectl logs <pod-name> -c <container-name>

# 检查节点资源
kubectl top nodes
kubectl describe node <node-name>
```

**问题 3：网络不通**
```bash
# 检查 CNI
kubectl get pods -n kube-system -l k8s-app=flannel

# 测试 Pod 网络
kubectl run test --image=busybox --restart=Never -- sleep 3600
kubectl exec -it test -- ping <other-pod-ip>

# 检查 iptables 规则
sudo iptables-save | grep KUBE
```

### 9.2 性能调优

```yaml
# /etc/rancher/k3s/config.yaml
kube-apiserver-arg:
  - "max-requests-inflight=400"
  - "max-mutating-requests-inflight=200"

kube-controller-manager-arg:
  - "node-monitor-period=5s"
  - "node-monitor-grace-period=40s"
  - "pod-eviction-timeout=30s"

kubelet-arg:
  - "max-pods=110"
  - "pods-per-core=10"
  - "serialize-image-pulls=false"
```

### 9.3 调试技巧

```bash
# 进入节点调试
kubectl debug node/node1 -it --image=ubuntu

# Pod 调试容器
kubectl debug pod-name -it --image=busybox --target=container-name

# 网络抓包
kubectl sniff pod-name -c container-name

# 查看系统日志
journalctl -xe -u k3s

# 检查证书
sudo openssl x509 -in /var/lib/rancher/k3s/server/tls/serving-kube-apiserver.crt -text -noout
```

### 9.4 性能基准测试

```bash
# API Server 压测
kubectl run apache-bench --image=httpd --rm -it --restart=Never -- \
  ab -n 1000 -c 10 https://kubernetes.default.svc/

# Pod 启动速度测试
time kubectl run nginx --image=nginx --rm -it --restart=Never -- echo "done"

# 存储性能测试
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: fio-test
spec:
  containers:
  - name: fio
    image: ljishen/fio
    command: ["fio"]
    args:
    - "--name=randwrite"
    - "--ioengine=libaio"
    - "--iodepth=32"
    - "--rw=randwrite"
    - "--bs=4k"
    - "--direct=1"
    - "--size=1G"
    - "--numjobs=1"
    - "--runtime=60"
    - "--group_reporting"
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: data
    emptyDir: {}
EOF

kubectl logs -f fio-test
```

---

## 10. 总结与展望

### 10.1 核心要点回顾

**K3s 的技术优势：**
```
✅ 轻量级：~70MB 二进制，512MB 内存即可运行
✅ 简单性：单命令安装，零依赖
✅ 完整性：100% Kubernetes 兼容，通过 CNCF 认证
✅ 生产级：内置 HA、自动备份、TLS 加密
✅ 灵活性：支持 SQLite/etcd/MySQL/PostgreSQL 存储
```

**本文覆盖内容：**
1. **理论基础**：架构设计、组件原理、精简策略
2. **快速入门**：单节点、多节点、高可用部署
3. **核心概念**：Server/Agent、存储、网络、配置
4. **高级特性**：自定义 CNI、私有仓库、资源管理
5. **生产案例**：完整微服务电商平台（15+ 组件）
6. **运维实践**：监控告警、备份恢复、故障排查

### 10.2 适用场景建议

| 场景 | 推荐度 | 说明 |
|------|--------|------|
| **边缘计算** | ⭐⭐⭐⭐⭐ | IoT、CDN 节点、分支机构 |
| **开发测试** | ⭐⭐⭐⭐⭐ | 本地开发、CI/CD 流水线 |
| **小型生产** | ⭐⭐⭐⭐ | < 50 节点，< 1000 Pod |
| **学习研究** | ⭐⭐⭐⭐⭐ | Kubernetes 入门最佳选择 |
| **大规模集群** | ⭐⭐ | > 100 节点建议用标准 K8s |
| **金融/政务** | ⭐⭐⭐ | 需评估合规性要求 |

### 10.3 性能对比（vs 标准 K8s）

```
指标对比：
┌─────────────────┬──────────┬─────────┬─────────┐
│     指标        │   K3s    │   K8s   │  提升   │
├─────────────────┼──────────┼─────────┼─────────┤
│ 安装时间        │   30s    │  15min  │  30x    │
│ 内存占用(空载)  │  512MB   │  2.5GB  │  5x     │
│ 二进制大小      │  70MB    │  1.5GB  │  20x    │
│ 启动时间        │  10s     │  60s    │  6x     │
│ API 响应时间    │  ~相同   │  ~相同  │  1x     │
└─────────────────┴──────────┴─────────┴─────────┘
```

### 10.4 实战案例总结

通过电商平台案例，我们实践了：

**架构层面：**
- ✅ 三层架构：前端 → 网关 → 微服务 → 中间件
- ✅ 命名空间隔离：prod / middleware / monitoring
- ✅ 服务发现：Kubernetes Service + DNS
- ✅ 流量管理：Traefik Ingress + Middleware

**可靠性：**
- ✅ 高可用：3 节点 etcd 集群
- ✅ 自愈能力：Liveness/Readiness Probe
- ✅ 自动扩容：HPA 基于 CPU/内存
- ✅ 滚动更新：零停机部署

**可观测性：**
- ✅ 指标监控：Prometheus + Grafana
- ✅ 日志聚合：kubectl logs（可扩展 Loki）
- ✅ 链路追踪：可集成 Jaeger/Zipkin

**安全加固：**
- ✅ 网络隔离：NetworkPolicy
- ✅ 密钥管理：Kubernetes Secret
- ✅ 权限控制：RBAC
- ✅ TLS 加密：默认启用

### 10.5 下一步学习路径

**初学者（已完成本文）：**
```
1. 搭建本地 K3s 集群
2. 部署示例应用
3. 学习 kubectl 常用命令
4. 理解 Pod、Service、Deployment 概念
```

**进阶（3-6 个月）：**
```
1. 学习 Helm 包管理
2. 实践 GitOps（ArgoCD/Flux）
3. 集成 CI/CD 流水线
4. 深入理解网络和存储
```

**高级（6-12 个月）：**
```
1. 服务网格（Istio/Linkerd）
2. 多集群管理
3. 自定义 Operator 开发
4. 性能调优和成本优化
```

### 10.6 未来趋势

**K3s 发展方向：**
- 🔮 更好的 ARM 支持（Apple Silicon、树莓派）
- 🔮 增强的边缘计算能力（KubeEdge 集成）
- 🔮 改进的 HA 方案（Kine 优化）
- 🔮 WebAssembly 运行时支持

**云原生趋势：**
- 🚀 Serverless + K8s（Knative）
- 🚀 eBPF 网络加速（Cilium）
- 🚀 GitOps 成为标准
- 🚀 平台工程（Platform Engineering）

### 10.7 推荐资源

**官方文档：**
- [K3s 官方文档](https://docs.k3s.io/)
- [K3s GitHub](https://github.com/k3s-io/k3s)
- [SUSE Rancher](https://www.rancher.com/)

**社区资源：**
- [K3s 论坛](https://forums.rancher.com/c/k3s/)
- [Kubernetes 官方文档](https://kubernetes.io/docs/)
- [CNCF Landscape](https://landscape.cncf.io/)

**实战项目：**
- [Awesome K3s](https://github.com/k3s-io/awesome-k3s)
- [K3s + Raspberry Pi](https://github.com/k3s-io/k3s/discussions)
- [K3sup (K3s Setup)](https://github.com/alexellis/k3sup)

**书籍推荐：**
- 《Kubernetes in Action》
- 《The Kubernetes Book》
- 《Cloud Native DevOps with Kubernetes》