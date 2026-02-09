---
title: Kamal：现代化的 Web 应用部署工具
published: 2026-02-09
description: 深入介绍 Kamal 部署工具的核心特性与实践。Kamal 是由 Basecamp 团队开发的现代化部署工具，结合容器化技术与传统部署工具的简洁性，让开发者能够以低成本、低复杂度实现生产级别的 Web 应用部署。
tags: [Kamal, Docker, 容器化, 部署, DevOps, 运维, Web应用]
category: DevOps
draft: false
---

Kamal 是由 Basecamp 团队开发的一款开源部署工具，旨在简化 Web 应用的部署流程。这个项目最初由 DHH（David Heinemeier Hansson，Ruby on Rails 的创始人）推出，目标是让开发者能够轻松地将 Web 应用部署到任何服务器上，而无需依赖复杂的 PaaS 平台。

### 为什么需要 Kamal？

在云原生时代，虽然 Kubernetes、AWS ECS 等平台功能强大，但对于中小型项目来说往往过于复杂和昂贵。Kamal 的设计理念是：**将传统部署工具（如 Capistrano）的简洁性与现代容器化技术的优势相结合**，让开发者能够以更低的成本和复杂度实现生产级别的部署。

## 适用与不适用场景

在开始使用 Kamal 之前，先判断它是否适合你的项目需求。

### ✅ 适合使用 Kamal 的场景

#### 1. 中小型 Web 应用
- **流量规模**：日活 < 100 万，请求量 < 1000 万/天
- **团队规模**：1-10 人的小团队，没有专职运维
- **典型案例**：你的 `local-life-server`、`shops` 等项目

**为什么适合：**
- 配置简单，学习成本低
- 不需要专门的运维团队
- 成本可控（几台 VPS 即可）

#### 2. 多个小项目需要部署
- **场景**：你有多个独立项目需要部署
- **典型案例**：
  - `local-life-server`（后端 API）
  - `local-life-front`（前端）
  - `shops`（商店系统）

**为什么适合：**
- 单台服务器可运行多个应用
- 自动域名路由和 SSL 管理
- 成本优势明显（1 台服务器 vs 3 台）

**实际对比：**

| 方案 | 操作复杂度 | 月成本 | 说明 |
|------|-----------|--------|------|
| **Kamal（推荐）** | ⭐ 简单 | $10 | 单台 VPS，3 条命令部署 3 个应用 |
| PaaS（Heroku） | ⭐ 简单 | $75 | 每个应用 $25/月 |
| 手动配置 Docker + Nginx | ⭐⭐⭐⭐ 复杂 | $10 | 需手动配置反向代理、SSL、域名路由 |
| 多台 VPS 分离部署 | ⭐⭐ 中等 | $30 | 每个应用独立服务器，运维简单但成本高 |

**使用 Kamal 部署 3 个应用：**
```bash
# 成本：$10/月（1 台 VPS）
# 时间：15 分钟完成所有配置
cd /Users/wangshian/Desktop/work/local-life-server && kamal deploy
cd /Users/wangshian/Desktop/work/local-life-front && kamal deploy
cd /Users/wangshian/Desktop/work/shops && kamal deploy

# Kamal 自动处理：
# ✅ Nginx 反向代理（通过 Kamal Proxy）
# ✅ SSL 证书（Let's Encrypt 自动申请）
# ✅ 域名路由（api.local-life.com、www.local-life.com、shops.example.com）
# ✅ 零停机部署
```

**传统方式对比：**

```bash
# 方式 1：使用 PaaS（Heroku）
# 成本：$75/月（每个应用 $25）
# 优点：部署简单
# 缺点：成本高，被平台绑定

heroku create local-life-server  # $25/月
heroku create local-life-front   # $25/月
heroku create shops               # $25/月

# 方式 2：手动配置 Docker + Nginx
# 成本：$10/月（1 台 VPS）
# 优点：成本低
# 缺点：配置复杂，需要手动管理

# 需要手动配置：
# 1. 安装 Docker
# 2. 配置 Nginx 反向代理（~100 行配置）
# 3. 申请和管理 SSL 证书（3 个域名）
# 4. 配置域名路由规则
# 5. 设置自动更新证书
# 6. 实现零停机部署（自己写脚本）
# 估计时间：4-8 小时（如果熟悉的话）

# 方式 3：每个应用独立服务器
# 成本：$30/月（3 台 VPS）
# 优点：隔离性好，运维简单
# 缺点：成本高，资源浪费

# 服务器 1：运行 local-life-server ($10/月)
# 服务器 2：运行 local-life-front ($10/月)
# 服务器 3：运行 shops ($10/月)
```

**Kamal 的优势总结：**
- 💰 **成本**：$10/月（vs PaaS $75/月，vs 多服务器 $30/月）
- ⏱️ **时间**：15 分钟配置（vs 手动配置 4-8 小时）
- 🎯 **简单**：3 条命令（vs 手动配置数百行 Nginx）
- 🔒 **SSL**：自动管理（vs 手动申请和续期）
- 🚀 **部署**：零停机（vs 自己实现）

#### 3. 需要完全控制基础设施
- **不想被云平台绑定**
- **需要使用廉价 VPS**（Hetzner $5/月 vs AWS $50/月）
- **对数据和代码有严格控制要求**

**为什么适合：**
- 完全掌控服务器
- 可以随时更换云服务商
- 避免 PaaS 的高昂费用

#### 4. 流量相对稳定可预测
- **无需自动扩缩容**
- **流量波动小于 3 倍**
- **可以手动应对流量增长**

**示例：**
```
正常流量：500 req/min
高峰流量：1500 req/min（可预测，如促销活动）
解决方案：提前手动扩容 2 台服务器
```

#### 5. 追求简单和快速部署
- **希望 10 分钟内完成部署配置**
- **不想学习复杂的 K8s 概念**
- **需要快速上线 MVP**

**为什么适合：**
```bash
# Kamal：3 条命令完成部署
kamal init
# 编辑 config/deploy.yml（5 分钟）
kamal setup

# Kubernetes：需要学习数十个概念
# Deployment, Service, Ingress, ConfigMap, Secret,
# PV, PVC, HPA, RBAC, NetworkPolicy...
```

### ❌ 不适合使用 Kamal 的场景

#### 1. 超大规模应用
- **日活 > 1000 万**
- **请求量 > 1 亿/天**
- **需要数百台服务器**

**为什么不适合：**
- Kamal 手动管理服务器列表会很繁琐
- 缺少自动扩缩容
- 建议使用：**Kubernetes + HPA**

#### 2. 流量波动极大且不可预测
- **流量峰值是平时的 10 倍以上**
- **突发流量无法提前预知**
- **需要秒级自动扩容**

**示例场景：**
```
社交媒体应用：某个内容突然爆火
电商大促：双 11 流量突增 50 倍
新闻应用：突发事件导致流量暴涨
```

**为什么不适合：**
- Kamal 不支持自动扩容
- 手动扩容需要几分钟
- 建议使用：**AWS Auto Scaling、Google Cloud Run**

#### 3. 需要复杂的微服务编排
- **数十个微服务相互依赖**
- **需要复杂的服务网格**
- **需要细粒度的流量控制**

**示例：**
```
100+ 微服务
服务间熔断、限流、重试
A/B 测试需要 1% 流量路由
灰度发布需要精确控制流量比例
```

**为什么不适合：**
- Kamal 的流量控制能力有限
- 缺少服务网格功能
- 建议使用：**Kubernetes + Istio**

#### 4. 团队已经熟悉 Kubernetes
- **有专职 DevOps/SRE 团队**
- **已有完善的 K8s 基础设施**
- **团队已投入学习 K8s**

**为什么不适合：**
- 没有必要切换到 Kamal
- K8s 能力更强大
- 继续使用 Kubernetes 即可

#### 5. 需要高级功能
以下功能 Kamal 目前不支持或支持有限：

| 功能 | Kamal 支持情况 | 替代方案 |
|------|---------------|---------|
| 自动扩缩容 | ❌ 不支持 | Kubernetes HPA |
| 服务网格 | ❌ 不支持 | Istio / Linkerd |
| 复杂的流量分割 | ⚠️ 有限支持 | Kubernetes + Flagger |
| 多集群管理 | ❌ 不支持 | Kubernetes Federation |
| 资源配额管理 | ⚠️ 基础支持 | Kubernetes ResourceQuota |
| 秒级故障转移 | ⚠️ 依赖健康检查 | Kubernetes |

### 🤔 决策流程

```
开始
 │
 ├─> 你的应用是否需要自动扩缩容？
 │   ├─ 是 → 使用 Kubernetes / Cloud Run
 │   └─ 否 → 继续
 │
 ├─> 你的团队规模是否 < 10 人？
 │   ├─ 否 → 考虑 Kubernetes（有资源投入）
 │   └─ 是 → 继续
 │
 ├─> 你的日活是否 < 100 万？
 │   ├─ 否 → 使用 Kubernetes
 │   └─ 是 → 继续
 │
 ├─> 你是否希望控制成本？
 │   ├─ 是 → 继续
 │   └─ 否 → 可以考虑 PaaS（Heroku/Render）
 │
 └─> ✅ Kamal 非常适合你！
```

### 📊 成本对比

以你的实际项目为例（`local-life-server` + `local-life-front` + `shops`）：

| 方案 | 月成本 | 复杂度 | 适用场景 |
|------|--------|--------|---------|
| **Kamal（推荐）** | $10-30 | ⭐ 低 | 3 个小项目，流量不大 |
| Heroku | $75-150 | ⭐ 低 | 快速原型，不在乎成本 |
| AWS ECS | $100-300 | ⭐⭐⭐ 中 | 中等规模，需要 AWS 生态 |
| Kubernetes | $150-500 | ⭐⭐⭐⭐⭐ 高 | 大规模，需要自动扩容 |

**Kamal 详细成本：**
```bash
# 方案 A：单机多应用（省钱）
1 台 VPS ($10/月) 运行 3 个应用
总成本：$10/月

# 方案 B：多服务器（高可用）
每个应用 3 台服务器
3 应用 × 3 服务器 × $5 = $45/月
负载均衡器: $10/月
总成本：$55/月（仍远低于 K8s）
```

### 💡 实际建议

**你的项目（local-life-server、shops 等）应该使用 Kamal，如果：**
- ✅ 团队规模 < 10 人
- ✅ 预算有限（< $100/月）
- ✅ 流量可预测（日活 < 10 万）
- ✅ 需要快速上线
- ✅ 不想学习复杂的 K8s

**你应该考虑 Kubernetes，如果：**
- ⚠️ 日活 > 100 万
- ⚠️ 需要自动扩缩容
- ⚠️ 有专职运维团队
- ⚠️ 流量波动 > 10 倍

**快速自测：**
```bash
# 你的应用每天有多少请求？
如果 < 1000 万 → Kamal ✅
如果 > 1 亿 → Kubernetes ⚠️

# 你的团队有多少人？
如果 < 10 人 → Kamal ✅
如果 > 50 人 → Kubernetes ⚠️

# 你的预算是多少？
如果 < $100/月 → Kamal ✅
如果 > $500/月 → Kubernetes / PaaS ⚠️
```

### 总结

Kamal 的**最佳适用场景**：
- 🎯 中小型项目（你的 local-life-server、shops）
- 💰 预算有限，需要控制成本
- 👨‍💻 小团队，无专职运维
- 📈 流量稳定可预测
- 🚀 追求简单快速

**不要使用 Kamal** 如果你需要：
- 🔥 自动扩缩容
- 📊 超大规模（日活百万级）
- 🕸️ 复杂微服务编排
- 🌊 流量波动极大

对于大多数创业公司和中小项目，**Kamal 是成本和复杂度的最佳平衡点**。

## 核心原理

### 工作流程

Kamal 的部署流程可以概括为以下几个步骤：

1. **构建容器镜像**：在本地或 CI/CD 环境中构建 Docker 镜像
2. **推送到镜像仓库**：将构建好的镜像推送到 Docker Hub、GitHub Container Registry 或其他容器注册中心
3. **SSH 连接服务器**：通过 SSH 连接到目标服务器
4. **拉取并运行容器**：在服务器上拉取最新镜像并在轻量级容器中运行
5. **流量路由**：通过内置的代理（Kamal Proxy）管理流量路由和负载均衡

### 与传统工具的对比

- **vs Capistrano**：Kamal 使用 Docker 容器而非直接在服务器上运行代码，提供了更好的环境一致性
- **vs Kubernetes**：Kamal 更轻量级，配置更简单，适合中小型应用
- **vs PaaS**：Kamal 让你保持对基础设施的完全控制，同时降低成本

## Kamal 2 的核心特性

### 1. Kamal Proxy

Kamal 2 最大的更新是引入了自研的 **Kamal Proxy**（替代了之前的 Traefik），它提供了以下功能：

- **多应用部署**：在同一台服务器上运行多个应用
- **基于主机的路由**：通过域名自动路由到不同的应用
- **维护模式**：一键切换应用到维护页面
- **零停机部署**：blue-green 部署模式，确保服务不中断
- **请求暂停**：在部署过程中可以暂停和恢复请求

**注意**：虽然 Kamal Proxy 的架构支持金丝雀发布（按流量百分比灰度），但该功能尚未在 Kamal 2 中完全实现，计划在未来版本中推出。目前可以使用跨服务器的滚动部署来实现类似效果。

### 2. 自动 HTTPS

通过 Let's Encrypt 自动生成和管理 SSL 证书，无需手动配置。

### 3. 改进的密钥管理

支持从密码管理器中读取敏感信息，提高安全性。

### 4. 命令别名

可以为 Kamal 命令创建别名，简化日常操作。

### 5. 附属服务管理

轻松管理数据库、Redis、Elasticsearch 等附属服务。

## 安装指南

### 前置要求

- Ruby 环境（推荐 Ruby 3.0+）
- 目标服务器需要支持 Docker
- SSH 访问权限
- Dockerfile
- 容器镜像仓库（如 Docker Hub）

### 安装步骤

使用 Ruby Gem 安装 Kamal：

```bash
gem install kamal
```

如果你更喜欢使用 Docker 方式，可以参考官方文档的 Docker 安装方式。

## 快速开始（5 分钟）

想立即体验 Kamal 的强大之处？这个快速开始指南将在 5 分钟内让你完成第一次部署。

### 前提条件

在开始之前，确保你已经准备好：

- ✅ **一个 Web 应用项目**（Node.js、Rails、Django 等任何可容器化的应用）
- ✅ **项目中有 Dockerfile**（如果没有，先创建一个）
- ✅ **一台 VPS 服务器**（DigitalOcean、Hetzner、Linode 等，或者测试服务器）
- ✅ **Docker Hub 账号**（或其他容器镜像仓库）
- ✅ **SSH 访问权限**（能通过 SSH 连接到服务器）

### 三步完成部署

#### 步骤 1：安装 Kamal（30 秒）

```bash
gem install kamal
```

验证安装：
```bash
kamal version
# 输出：Kamal 2.x.x
```

#### 步骤 2：初始化项目（2 分钟）

以你的项目为例（这里以 `local-life-server` 为示例）：

```bash
# 进入你的项目目录
cd ~/your-project-name
# 或者
cd /Users/wangshian/Desktop/work/local-life-server

# 初始化 Kamal（会创建 config/deploy.yml）
kamal init
```

#### 步骤 3：配置并部署（2 分钟）

编辑生成的 `config/deploy.yml` 文件，填入你的信息：

```yaml
# config/deploy.yml - 最小化配置
service: your-app-name              # 改为你的应用名
image: your-dockerhub/your-app      # 改为你的 Docker Hub 用户名/镜像名

servers:
  web:
    hosts:
      - 123.45.67.89                # 改为你的服务器 IP

registry:
  username: your-dockerhub-username  # 改为你的 Docker Hub 用户名
  password:
    - KAMAL_REGISTRY_PASSWORD       # 从环境变量读取密码

proxy:
  ssl: true                          # 自动 HTTPS
  host: your-domain.com              # 改为你的域名
```

**设置环境变量并部署：**

```bash
# 设置 Docker Hub 密码
export KAMAL_REGISTRY_PASSWORD=your-dockerhub-password

# 首次部署（会自动安装 Docker、配置网络、启动应用）
kamal setup
```

等待 2-3 分钟，部署完成！

### 验证部署

```bash
# 查看应用状态
kamal app status

# 输出示例：
# 123.45.67.89: your-app-web running (healthy)

# 查看应用日志
kamal app logs --follow
```

### 访问你的应用

如果配置了域名和 SSL：
```
https://your-domain.com
```

如果没有域名，直接访问 IP：
```
http://123.45.67.89
```

### 🎉 恭喜！

你已经成功使用 Kamal 完成了第一次部署！接下来你可以：

- 📖 继续阅读[使用指南](#使用指南)了解详细配置
- 🚀 学习[实际应用场景](#实际应用场景)掌握更多技巧
- 💡 查看[最佳实践](#最佳实践)优化你的部署

### 下次更新怎么部署？

当你修改了代码，重新部署非常简单：

```bash
cd ~/your-project-name
kamal deploy
```

就这么简单！Kamal 会自动：
- 构建新的 Docker 镜像
- 推送到镜像仓库
- 在服务器上拉取最新镜像
- 零停机替换旧容器

### 遇到问题？

- 🔍 查看[常见问题 FAQ](#常见问题-faq)
- 📚 阅读[故障排查](#故障排查)章节
- 💬 参考[官方文档](https://kamal-deploy.org/)

## 使用指南

### 1. 初始化项目

以你本地的 `local-life-server` 项目为例：

```bash
# 进入项目目录
cd /Users/wangshian/Desktop/work/local-life-server

# 初始化 Kamal
kamal init
```

这将创建 `config/deploy.yml` 配置文件。

### 2. 配置部署

编辑 `config/deploy.yml`，配置你的服务器信息：

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

# 服务器配置
servers:
  web:
    hosts:
      - 123.45.67.10    # 你的生产服务器 IP
      - 123.45.67.11
    options:
      network: "private"

# Docker 镜像仓库（使用 Docker Hub）
registry:
  username: wangshian
  password:
    - KAMAL_REGISTRY_PASSWORD

# 代理配置
proxy:
  ssl: true
  host: api.local-life.com    # 你的域名
  healthcheck:
    path: /health             # NestJS 健康检查端点
    interval: 10

# 环境变量
env:
  secret:
    - DATABASE_URL
    - JWT_SECRET
  clear:
    NODE_ENV: production
    PORT: 3000

# 附属服务
accessories:
  db:
    image: postgres:15
    host: 123.45.67.10
    port: 127.0.0.1:5432:5432
    env:
      clear:
        POSTGRES_USER: locallife
        POSTGRES_DB: locallife_prod
      secret:
        - POSTGRES_PASSWORD
    directories:
      - /var/lib/postgresql/data:/var/lib/postgresql/data
    options:
      memory: 1g

  redis:
    image: redis:7.0
    host: 123.45.67.10
    port: 127.0.0.1:6379:6379
    directories:
      - /var/lib/redis/data:/data
    options:
      memory: 512m
```

### 3. 首次设置服务器

在 `local-life-server` 项目目录下，首次部署到新服务器：

```bash
cd /Users/wangshian/Desktop/work/local-life-server

# 首次设置（自动安装 Docker、配置网络、启动数据库等）
kamal setup
```

这个命令会：
- 在服务器上安装 Docker
- 创建 Docker 网络
- 启动 PostgreSQL 和 Redis
- 部署 local-life-server 应用

### 4. 部署应用

当你修改代码后，重新部署：

```bash
cd /Users/wangshian/Desktop/work/local-life-server

# 部署更新
kamal deploy
```

Kamal 会自动：
- 构建新的 Docker 镜像
- 推送到 Docker Hub
- 在服务器上拉取最新镜像
- 零停机替换旧容器

### 5. 常用命令

```bash
# 查看应用状态
kamal app status

# 查看实时日志
kamal app logs --follow

# 查看最近 100 行日志
kamal app logs --lines 100

# 重启应用
kamal app restart

# 进入容器 shell
kamal app exec -i bash

# 在容器中执行命令
kamal app exec 'rails console'

# 回滚到上一个版本
kamal rollback

# 查看配置
kamal config

# 启动维护模式
kamal proxy boot_maintenance

# 关闭维护模式并重新部署
kamal proxy reboot

# 查看代理状态
kamal proxy status

# 删除旧容器镜像
kamal prune all
```

## 实际应用场景

### 场景 1：部署 NestJS 后端服务

以你本地的 `local-life-server`（NestJS 项目）为例：

```bash
# 项目目录
cd /Users/wangshian/Desktop/work/local-life-server

# 初始化 Kamal
kamal init

# 编辑 config/deploy.yml（见上面的配置示例）

# 首次部署
kamal setup

# 后续更新
kamal deploy
```

**查看应用状态：**
```bash
kamal app status
# 输出：123.45.67.10: local-life-server-web running (healthy)
```

### 场景 2：单服务器部署多个应用

假设你要在一台服务器上同时部署：
- `local-life-server`（后端 API）
- `local-life-front`（前端应用）
- `shops`（商店管理系统）

**配置示例：**

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.10    # 共用同一台服务器

proxy:
  host: api.local-life.com
  ssl: true
  healthcheck:
    path: /health
```

```yaml
# /Users/wangshian/Desktop/work/local-life-front/config/deploy.yml
service: local-life-front
image: wangshian/local-life-front

servers:
  web:
    hosts:
      - 123.45.67.10    # 共用同一台服务器

proxy:
  host: www.local-life.com
  ssl: true
```

```yaml
# /Users/wangshian/Desktop/work/shops/config/deploy.yml
service: shops
image: wangshian/shops

servers:
  web:
    hosts:
      - 123.45.67.10    # 共用同一台服务器

proxy:
  host: shops.example.com
  ssl: true
```

**部署所有应用：**
```bash
# 部署后端 API
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy

# 部署前端
cd /Users/wangshian/Desktop/work/local-life-front
kamal deploy

# 部署商店系统
cd /Users/wangshian/Desktop/work/shops
kamal deploy
```

**工作原理：**
- Kamal Proxy 自动根据域名路由流量
- `api.local-life.com` → local-life-server
- `www.local-life.com` → local-life-front
- `shops.example.com` → shops
- 三个应用共享同一台服务器和 Kamal Proxy
- 自动 HTTPS 证书管理

**成本优势：**
一台 $10/月 的 VPS 就能运行 3 个应用，而不是每个应用一台服务器（$30/月）。

### 场景 3：滚动部署（多服务器平滑更新）

假设你的 `local-life-server` 部署在 4 台服务器上，需要更新版本：

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

boot:
  limit: 25%  # 每次只更新 1 台服务器（4 台的 25%）
  wait: 30    # 等待 30 秒观察后再更新下一台

servers:
  web:
    hosts:
      - 123.45.67.10
      - 123.45.67.11
      - 123.45.67.12
      - 123.45.67.13
```

**部署流程：**
```bash
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy

# Kamal 会这样执行：
# 1. 更新 123.45.67.10 → 健康检查 → 等待 30 秒
# 2. 更新 123.45.67.11 → 健康检查 → 等待 30 秒
# 3. 更新 123.45.67.12 → 健康检查 → 等待 30 秒
# 4. 更新 123.45.67.13 → 完成
```

**零停机保障：**
- 每次只更新 1 台，其他 3 台继续服务
- 新容器健康检查通过后才接收流量
- 如果某台更新失败，自动停止部署

**注意**：Kamal 2 采用 blue-green 部署模式，新实例健康检查通过后，流量立即切换。基于流量百分比的金丝雀发布计划在未来版本推出。

## 水平扩展与缩容

虽然 Kamal 不支持自动扩容，但支持**无感知的手动水平扩展和缩容**。通过正确的方法，可以在不影响线上服务的情况下动态调整服务器数量。

### 无感知扩容（添加服务器）

#### 方法 1：使用 `--hosts` 参数（推荐）

这是最佳实践，只在新服务器上部署，完全不影响现有服务器：

```bash
# 步骤 1：在云服务商创建新的 VPS 实例
# 假设新服务器 IP: 192.168.1.14, 192.168.1.15

# 步骤 2：编辑 config/deploy.yml，添加新服务器
servers:
  web:
    hosts:
      - 192.168.1.10  # 现有服务器
      - 192.168.1.11  # 现有服务器
      - 192.168.1.12  # 现有服务器
      - 192.168.1.13  # 现有服务器
      - 192.168.1.14  # 新增 ⬅️
      - 192.168.1.15  # 新增 ⬅️

# 步骤 3：只在新服务器上部署（不触碰现有服务器）
kamal deploy --hosts=192.168.1.14,192.168.1.15

# 步骤 4：验证新服务器状态
kamal app status --hosts=192.168.1.14,192.168.1.15

# 步骤 5：检查 Proxy 是否已将新服务器加入负载均衡
kamal proxy status
```

**工作原理：**
1. Kamal 只在指定的新服务器上执行完整部署（安装 Docker、启动容器等）
2. Kamal Proxy 自动检测新实例的健康状态
3. 健康检查通过后，自动将新服务器加入负载均衡池
4. **现有服务器持续运行，流量无中断**

#### 方法 2：结合滚动部署

如果需要同时更新所有服务器（包括新旧服务器），使用滚动部署确保平滑过渡：

```yaml
# config/deploy.yml
boot:
  limit: 1        # 每次只部署 1 台服务器
  wait: 30        # 等待 30 秒后再部署下一台

servers:
  web:
    hosts:
      - 192.168.1.10
      - 192.168.1.11
      - 192.168.1.12
      - 192.168.1.13
      - 192.168.1.14  # 新增
      - 192.168.1.15  # 新增
```

```bash
# 滚动部署到所有服务器（包括新增的）
kamal deploy
```

Kamal 会逐台部署，始终保持大部分服务器在线提供服务。

### 无感知缩容（移除服务器）

缩容需要更谨慎，确保先停止流量再移除服务器：

```bash
# 步骤 1：从配置中移除要下线的服务器
# 编辑 config/deploy.yml
servers:
  web:
    hosts:
      - 192.168.1.10
      - 192.168.1.11
      - 192.168.1.12
      - 192.168.1.13
      # 移除 192.168.1.14
      # 移除 192.168.1.15

# 步骤 2：在要下线的服务器上停止应用容器
kamal app stop --hosts=192.168.1.14,192.168.1.15

# 步骤 3：重启 Proxy 以更新路由表（移除已下线服务器）
kamal proxy reboot

# 步骤 4：验证 Proxy 状态（确认已移除目标服务器）
kamal proxy status

# 步骤 5：（可选）完全清理下线服务器上的 Kamal 资源
kamal remove --hosts=192.168.1.14,192.168.1.15
```

**注意事项：**
- 在停止服务器前，确保剩余服务器能够承载全部流量
- 建议在流量低峰期进行缩容操作
- `kamal app stop` 会优雅关闭容器，等待现有请求处理完成

### 零停机的技术保障

#### 1. Kamal Proxy 的智能流量管理

```
┌─────────────────────────────────────────┐
│         Kamal Proxy (负载均衡)           │
│                                         │
│  健康检查：每 10 秒检查一次              │
│  策略：Round-robin 轮询                 │
└─────────────────────────────────────────┘
          │         │         │
          ▼         ▼         ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ 服务器1 │ │ 服务器2 │ │ 服务器3 │
    │  (运行) │ │  (运行) │ │ (新增)  │
    └─────────┘ └─────────┘ └─────────┘
                              │
                              ▼
                        健康检查通过
                        自动接收流量
```

#### 2. 健康检查配置

确保配置合理的健康检查参数：

```yaml
proxy:
  healthcheck:
    path: /health            # 健康检查端点
    interval: 10             # 每 10 秒检查一次
    timeout: 5s              # 超时时间
    max_attempts: 7          # 最多尝试 7 次

# 在 NestJS 应用中实现健康检查端点
# src/health/health.controller.ts
# @Get('/health')
# check() { return { status: 'ok' }; }
```

#### 3. 流量切换过程

**扩容时：**
1. 新容器启动 → 健康检查（7 次尝试）→ 通过 → 接收流量
2. 整个过程中，现有服务器持续处理请求

**缩容时：**
1. 停止容器 → Proxy 检测到不健康 → 停止路由流量 → 优雅关闭

### 完整示例：扩展 local-life-server 从 4 台到 6 台

假设你的 `local-life-server` 当前部署在 4 台服务器上，需要扩容到 6 台：

```bash
# === 当前状态 ===
# 项目：/Users/wangshian/Desktop/work/local-life-server
# 现有服务器：123.45.67.10-13（4 台）

# === 第 1 步：准备新服务器 ===
# 在云服务商（如 Hetzner/DigitalOcean）创建 2 台新 VPS
# 新服务器 IP: 123.45.67.14, 123.45.67.15
# 配置 SSH 密钥，确保可以访问

# === 第 2 步：更新配置文件 ===
cd /Users/wangshian/Desktop/work/local-life-server
# 编辑 config/deploy.yml
```

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.10
      - 123.45.67.11
      - 123.45.67.12
      - 123.45.67.13
      - 123.45.67.14    # 新增 ⬅️
      - 123.45.67.15    # 新增 ⬅️
    options:
      memory: 2g
      cpus: 2

proxy:
  ssl: true
  host: api.local-life.com
  healthcheck:
    path: /health
    interval: 10
```

```bash
# === 第 3 步：只部署到新服务器 ===
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy --hosts=123.45.67.14,123.45.67.15

# 输出示例：
# [123.45.67.14] Installing Docker...
# [123.45.67.14] Setting up kamal network...
# [123.45.67.14] Pulling image wangshian/local-life-server...
# [123.45.67.14] Starting container...
# [123.45.67.14] Running healthcheck on /health
# [123.45.67.14] Healthcheck passed ✓
# [123.45.67.15] Installing Docker...
# ...

# === 第 4 步：验证新服务器 ===
kamal app status --hosts=123.45.67.14,123.45.67.15

# 输出示例：
# 123.45.67.14: local-life-server-web running (healthy)
# 123.45.67.15: local-life-server-web running (healthy)

# 检查所有服务器
kamal app status

# 输出示例：
# 123.45.67.10: local-life-server-web running (healthy)
# 123.45.67.11: local-life-server-web running (healthy)
# 123.45.67.12: local-life-server-web running (healthy)
# 123.45.67.13: local-life-server-web running (healthy)
# 123.45.67.14: local-life-server-web running (healthy) ⬅️ 新增
# 123.45.67.15: local-life-server-web running (healthy) ⬅️ 新增

# === 第 5 步：验证负载均衡 ===
kamal proxy status

# 应该看到 6 个后端目标都在接收流量

# === 第 6 步：监控新服务器日志 ===
kamal app logs --hosts=123.45.67.14,123.45.67.15 --follow

# 应该能看到新服务器开始处理请求
```

### 监控与验证

#### 1. 实时流量监控

在扩容 `local-life-server` 过程中监控应用，确保无中断：

```bash
# 在扩容前启动监控脚本
while true; do
  response=$(curl -s -o /dev/null -w "%{http_code}" https://api.local-life.com/health)
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] HTTP Status: $response"

  if [ "$response" != "200" ]; then
    echo "⚠️  WARNING: Non-200 response detected!"
  fi

  sleep 1
done

# 在另一个终端执行扩容操作
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy --hosts=123.45.67.14,123.45.67.15

# 观察第一个终端的监控输出
# 应该全部是 200，没有中断
```

#### 2. 验证负载分布

确认新服务器是否接收到流量：

```bash
# 方法 1：查看访问日志
cd /Users/wangshian/Desktop/work/local-life-server
kamal app logs --hosts=123.45.67.14 | grep "GET /"

# 应该能看到请求日志，例如：
# [2026-02-09 10:23:45] GET /api/users 200 45ms
# [2026-02-09 10:23:46] GET /api/orders 200 32ms

# 方法 2：查看所有服务器的日志
kamal app logs --follow

# 方法 3：使用应用内指标
# 在 NestJS 中记录服务器 hostname
# 观察是否有来自新服务器的请求
```

#### 3. 性能监控

```bash
cd /Users/wangshian/Desktop/work/local-life-server

# 检查新服务器的容器资源使用
kamal app exec 'top -bn1' --hosts=123.45.67.14

# 查看内存使用
kamal app exec 'free -m' --hosts=123.45.67.14

# 查看 Node.js 进程
kamal app exec 'ps aux | grep node' --hosts=123.45.67.14

# 或者直接 SSH 到服务器查看 Docker 统计
ssh root@123.45.67.14
docker stats local-life-server-web
```

### 注意事项与最佳实践

#### ✅ 扩容最佳实践

1. **使用 `--hosts` 参数**
   - 避免触碰现有稳定运行的服务器
   - 减少部署时间和风险

2. **逐步扩容**
   ```bash
   cd /Users/wangshian/Desktop/work/local-life-server

   # 先添加 1 台观察
   kamal deploy --hosts=123.45.67.14

   # 确认无问题后再添加更多
   kamal deploy --hosts=123.45.67.15,123.45.67.16
   ```

3. **配置一致性**
   - 确保新服务器配置与现有服务器一致
   - CPU、内存、磁盘、网络等参数应该相同

4. **提前测试健康检查**
   ```bash
   # 在新服务器上手动测试
   curl -I http://123.45.67.14:3000/health

   # 应该返回 200 OK
   ```

5. **监控资源使用**
   - 确保新服务器有足够的资源
   - 避免内存或磁盘不足导致健康检查失败

#### ⚠️ 缩容注意事项

1. **容量规划**
   ```bash
   # 缩容前评估：剩余服务器能否承载全部流量？
   # 当前 6 台服务器，每台处理 1000 req/min
   # 缩减到 4 台，每台需处理 1500 req/min
   # 确保服务器能承受 50% 的流量增加
   ```

2. **优雅关闭**
   ```bash
   cd /Users/wangshian/Desktop/work/local-life-server

   # 不要直接 kill，使用 stop 等待请求处理完成
   kamal app stop --hosts=123.45.67.14

   # 不要立即销毁服务器，先观察 5-10 分钟
   ```

3. **回滚准备**
   ```bash
   cd /Users/wangshian/Desktop/work/local-life-server

   # 如果缩容后发现问题，快速恢复
   # 1. 重新添加到 config/deploy.yml
   # 2. 执行部署
   kamal deploy --hosts=123.45.67.14
   ```

4. **分批缩容**
   ```bash
   # 一次只移除 1-2 台服务器
   # 观察一段时间后再继续
   ```

#### 🚫 常见错误

1. **❌ 直接运行 `kamal deploy`**
   ```bash
   cd /Users/wangshian/Desktop/work/local-life-server

   # 错误：会重新部署所有服务器，包括正常运行的
   kamal deploy

   # 正确：只部署新增服务器
   kamal deploy --hosts=123.45.67.14,123.45.67.15
   ```

2. **❌ 未配置健康检查**
   - 没有健康检查端点会导致流量路由失败
   - 确保 NestJS 应用实现了 `/health` 端点

   ```typescript
   // src/health/health.controller.ts
   @Get('/health')
   check() {
     return { status: 'ok', timestamp: Date.now() };
   }
   ```

3. **❌ 缩容时直接删除配置**
   ```bash
   cd /Users/wangshian/Desktop/work/local-life-server

   # 错误：直接从 deploy.yml 删除并重启 proxy
   # 可能导致正在处理的请求丢失

   # 正确：先 stop，再重启 proxy，最后 remove
   kamal app stop --hosts=123.45.67.14
   kamal proxy reboot
   kamal remove --hosts=123.45.67.14
   ```

4. **❌ SSH 密钥未配置**
   - 确保新服务器已添加 SSH 公钥
   - 测试 SSH 连接：`ssh root@123.45.67.14`

### 与外部负载均衡器集成

如果使用外部负载均衡器（如 AWS ALB、HAProxy），可以使用钩子自动更新：

```yaml
# config/deploy.yml
hooks:
  post-deploy:
    - path: scripts/update_load_balancer.sh

# scripts/update_load_balancer.sh
#!/bin/bash
# 添加新服务器到 AWS ALB
if [ "$KAMAL_HOSTS" = "192.168.1.14,192.168.1.15" ]; then
  aws elbv2 register-targets \
    --target-group-arn arn:aws:elasticloadbalancing:... \
    --targets Id=192.168.1.14 Id=192.168.1.15
fi
```

### 总结

Kamal 的手动水平扩展虽然不是自动化的，但通过 `--hosts` 参数和 Kamal Proxy 的智能流量管理，可以实现：

- ✅ **完全无感知扩容** - 现有服务不受影响
- ✅ **安全的缩容** - 优雅关闭，不丢失请求
- ✅ **零停机操作** - 健康检查确保流量平滑切换
- ✅ **简单可控** - 只需修改配置 + 一条命令

对于大多数中小型应用，这种方式在**简单性、可控性和功能性之间达到了很好的平衡**。

## 单机多容器部署

Kamal 支持在单台服务器上部署**多个不同应用**（完全支持），但对于在单台服务器上运行**同一应用的多个容器实例**（副本），目前的支持有限。

### 支持情况说明

| 场景 | 支持程度 | 说明 |
|------|---------|------|
| 单机部署多个不同应用 | ✅ 完全支持 | Kamal 2 核心特性，生产可用 |
| 单机部署同一应用多副本 | ⚠️ 有限支持 | 需要手动配置，原生支持开发中 |

### 场景 1：单机多个不同应用 ✅ 推荐

这是 Kamal 2 的核心特性，以你的实际项目为例：

**在一台服务器同时部署三个项目：**

```bash
# 服务器：123.45.67.100（单台 VPS）
# 要部署的应用：
# 1. local-life-server (后端 API)
# 2. local-life-front (前端)
# 3. shops (商店系统)
```

**配置文件：**

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.100

proxy:
  host: api.local-life.com
  ssl: true
  healthcheck:
    path: /health
    interval: 10

env:
  secret:
    - DATABASE_URL
  clear:
    NODE_ENV: production
```

```yaml
# /Users/wangshian/Desktop/work/local-life-front/config/deploy.yml
service: local-life-front
image: wangshian/local-life-front

servers:
  web:
    hosts:
      - 123.45.67.100    # 同一台服务器

proxy:
  host: www.local-life.com
  ssl: true
```

```yaml
# /Users/wangshian/Desktop/work/shops/config/deploy.yml
service: shops
image: wangshian/shops

servers:
  web:
    hosts:
      - 123.45.67.100    # 同一台服务器

proxy:
  host: shop.example.com
  ssl: true
```

**部署步骤：**

```bash
# 1. 部署第一个应用（会安装 Docker 和 Kamal Proxy）
cd /Users/wangshian/Desktop/work/local-life-server
kamal setup

# 2. 部署第二个应用（检测到 Proxy 已存在，跳过安装）
cd /Users/wangshian/Desktop/work/local-life-front
kamal deploy

# 3. 部署第三个应用
cd /Users/wangshian/Desktop/work/shops
kamal deploy
```

**验证部署：**

```bash
# 查看服务器上的容器
ssh root@123.45.67.100
docker ps

# 输出示例：
# CONTAINER ID   IMAGE                           STATUS
# abc123...      kamal-proxy                     Up 2 hours
# def456...      wangshian/local-life-server     Up 1 hour
# ghi789...      wangshian/local-life-front      Up 30 minutes
# jkl012...      wangshian/shops                 Up 10 minutes
```

**流量路由：**

```
用户请求
    │
    ▼
┌─────────────────────────────┐
│   Kamal Proxy (443端口)     │
│   - SSL 自动管理            │
│   - 基于域名路由            │
└─────────────────────────────┘
         │       │       │
         │       │       └─────────────┐
         │       └─────────┐           │
         └─────┐           │           │
               ▼           ▼           ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────┐
   │ api.*.com   │ │ www.*.com   │ │ shop.*  │
   │ :3000       │ │ :3001       │ │ :3002   │
   │ 后端 API    │ │ 前端        │ │ 商店    │
   └─────────────┘ └─────────────┘ └─────────┘

   同一台服务器 (123.45.67.100)
```

**优势：**
- ✅ 成本节省：一台服务器运行多个应用
- ✅ 零配置：Kamal Proxy 自动路由
- ✅ 独立部署：每个应用可独立更新
- ✅ 自动 HTTPS：Let's Encrypt 自动证书

### 场景 2：单机同应用多副本 ⚠️ 需要变通

假设你想在一台服务器上运行 3 个 `local-life-server` 实例进行负载均衡。

**当前状态（2026 年初）：**
- Kamal Proxy 支持负载均衡（后端已就绪）
- Kamal 配置层暂未支持（前端未完成）
- 计划在未来版本添加 `replicas` 配置

**变通方案 1：使用不同角色模拟**

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web1:
    hosts:
      - 123.45.67.100
    cmd: node dist/main.js
    env:
      clear:
        PORT: 3001

  web2:
    hosts:
      - 123.45.67.100
    cmd: node dist/main.js
    env:
      clear:
        PORT: 3002

  web3:
    hosts:
      - 123.45.67.100
    cmd: node dist/main.js
    env:
      clear:
        PORT: 3003

proxy:
  host: api.local-life.com
  ssl: true
```

**问题：**
- ❌ 配置冗余，难以维护
- ❌ 需要手动管理端口
- ❌ 不够优雅

**变通方案 2：多台服务器（推荐）**

Kamal 的设计理念是跨服务器扩展，而不是单机多副本：

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.100    # 服务器 1
      - 123.45.67.101    # 服务器 2
      - 123.45.67.102    # 服务器 3
    options:
      memory: 2g
      cpus: 2

proxy:
  host: api.local-life.com
  ssl: true
```

**优势：**
- ✅ 高可用：单台服务器故障不影响整体服务
- ✅ 配置简单：一个配置管理多台服务器
- ✅ 负载均衡：Kamal Proxy 自动分发流量
- ✅ 成本可控：VPS 价格低廉（$5-10/月）

### 为什么推荐多服务器而非单机多副本？

**Kamal 的设计哲学：**

```
❌ 不推荐：单机多副本
┌─────────────────────────┐
│  服务器 (123.45.67.100) │
│  ┌────┐ ┌────┐ ┌────┐  │
│  │副本1│ │副本2│ │副本3│  │
│  └────┘ └────┘ └────┘  │
└─────────────────────────┘
问题：单点故障，服务器挂了全挂

✅ 推荐：多服务器
┌────────┐ ┌────────┐ ┌────────┐
│服务器1 │ │服务器2 │ │服务器3 │
│┌──────┐│ │┌──────┐│ │┌──────┐│
││ 实例 ││ ││ 实例 ││ ││ 实例 ││
│└──────┘│ │└──────┘│ │└──────┘│
└────────┘ └────────┘ └────────┘
优势：高可用，容错性好
```

### 实际建议

**如果你需要提升性能和可用性：**

| 需求 | 推荐方案 | 实现方式 |
|------|---------|---------|
| 运行多个不同项目 | ✅ 单机多应用 | 直接使用 Kamal 2 |
| 同一应用负载均衡 | ✅ 多服务器部署 | 每台服务器一个实例 |
| 单机高密度部署 | ⚠️ 等待官方支持 | 或使用 Docker Compose |

**成本对比（以 local-life-server 为例）：**

```bash
# 方案 A：单机多副本（不推荐）
# 1 台高配 VPS: $40/月
# 风险：单点故障

# 方案 B：多服务器（推荐）
# 3 台标准 VPS: 3 × $10 = $30/月
# 优势：高可用 + 负载均衡

# 方案 C：单机多应用（适合不同项目）
# 1 台标准 VPS: $10/月
# 适用：local-life-server + local-life-front + shops
```

### 未来功能（开发中）

Kamal 团队计划添加原生的单机多副本支持：

```yaml
# 未来可能的配置（尚未实现）
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.100
    replicas: 3    # 在这台服务器上运行 3 个副本
    options:
      memory: 1g
      cpus: 1
```

预计在未来的 Kamal 版本中实现。

### 完整示例：本地项目的最佳实践

**场景：你有 3 个项目需要部署**

```bash
# 选择 1：单机部署（省钱，适合低流量）
# 服务器：1 台 $10/月
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy  # 部署到 123.45.67.100

cd /Users/wangshian/Desktop/work/local-life-front
kamal deploy  # 部署到 123.45.67.100（共享）

cd /Users/wangshian/Desktop/work/shops
kamal deploy  # 部署到 123.45.67.100（共享）

# 选择 2：多服务器部署（高可用，适合生产）
# 服务器：3 台 $30/月
# 每个项目部署到独立的服务器集群
# local-life-server: 123.45.67.100-102
# local-life-front: 123.45.67.103-105
# shops: 123.45.67.106-108
```

**监控单机部署的容器：**

```bash
# SSH 到服务器
ssh root@123.45.67.100

# 查看所有容器
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 输出示例：
# NAMES                        STATUS          PORTS
# kamal-proxy                  Up 3 hours      0.0.0.0:443->443/tcp
# local-life-server-web        Up 2 hours      3000/tcp
# local-life-front-web         Up 1 hour       3001/tcp
# shops-web                    Up 30 mins      3002/tcp

# 查看资源使用
docker stats

# 输出示例：
# CONTAINER             CPU %    MEM USAGE / LIMIT
# local-life-server     2.5%     512MiB / 2GiB
# local-life-front      1.2%     256MiB / 1GiB
# shops                 0.8%     128MiB / 512MiB
```

### 总结

- ✅ **单机多应用**：Kamal 2 的核心特性，完全支持，生产可用
- ⚠️ **单机多副本**：有限支持，推荐使用多服务器替代
- 💡 **最佳实践**：不同项目用单机，同应用用多服务器
- 🚀 **未来更新**：原生多副本支持正在开发中

对于你本地的项目（local-life-server、local-life-front、shops），推荐：
- 开发/测试环境：单机部署所有项目
- 生产环境：每个项目独立的服务器集群

## 最佳实践

### 1. 使用环境变量管理密钥

不要在配置文件中硬编码密钥，使用环境变量：

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
env:
  secret:
    - DATABASE_URL
    - JWT_SECRET
    - POSTGRES_PASSWORD
  clear:
    NODE_ENV: production
```

在本地设置环境变量：
```bash
# 在部署前设置
export DATABASE_URL="postgres://user:pass@host:5432/db"
export JWT_SECRET="your-jwt-secret"
export POSTGRES_PASSWORD="your-db-password"

# 然后部署
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy
```

### 2. 配置健康检查

确保你的应用有健康检查端点。健康检查可以在 `proxy` 配置下或作为顶级配置：

```yaml
# 方式 1：在 proxy 下配置（推荐）
proxy:
  healthcheck:
    path: /up
    interval: 10

# 方式 2：顶级健康检查配置
healthcheck:
  path: /up
  port: 3000
  max_attempts: 7
  interval: 20s
  cord: /tmp/kamal-cord  # 用于零停机部署的协调文件
```

健康检查默认会尝试 7 次，每次间隔时间递增。只有当应用通过健康检查后，Kamal Proxy 才会将流量路由到新容器。

### 3. 设置资源限制

为容器设置合理的资源限制，避免单个容器占用过多资源：

```yaml
# /Users/wangshian/Desktop/work/local-life-server/config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

servers:
  web:
    hosts:
      - 123.45.67.10
      - 123.45.67.11
    options:
      memory: 2g      # NestJS 应用，给 2GB 内存
      cpus: 2         # 2 个 CPU 核心

  worker:
    hosts:
      - 123.45.67.12
    cmd: node dist/worker.js
    options:
      memory: 1g      # Worker 进程，1GB 足够
      cpus: 1
```

**注意**：如果不设置资源限制，容器将使用服务器上所有可用资源。对于生产环境，建议始终设置合理的限制，避免一个容器拖垮整个服务器。

### 4. 使用 CI/CD 集成

将 Kamal 集成到你的 CI/CD 流程中：

```yaml
# .github/workflows/deploy.yml
# local-life-server 的 GitHub Actions 部署配置
name: Deploy to Production

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Kamal
        run: gem install kamal

      - name: Deploy with Kamal
        run: |
          cd /Users/wangshian/Desktop/work/local-life-server
          kamal deploy
        env:
          KAMAL_REGISTRY_PASSWORD: ${{ secrets.DOCKER_PASSWORD }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

**GitHub Secrets 设置：**
在你的 GitHub 仓库设置中添加：
- `DOCKER_PASSWORD`：Docker Hub 密码
- `DATABASE_URL`：数据库连接字符串
- `JWT_SECRET`：JWT 密钥

## 常见问题 FAQ

### Q1: Kamal 支持哪些应用类型？

**A**: 任何可以容器化的应用都支持。只要有 Dockerfile，就能用 Kamal 部署。

**支持的技术栈：**
- **Node.js**: NestJS, Express, Next.js, Nuxt.js
- **Ruby**: Rails, Sinatra
- **Python**: Django, Flask, FastAPI
- **Go**: Gin, Echo, 标准库
- **PHP**: Laravel, Symfony
- **Java**: Spring Boot
- **其他**: Rust, Elixir, .NET 等

**示例 - 你的项目：**
```bash
✅ local-life-server (NestJS)
✅ local-life-front (Vue.js/React)
✅ shops (任何 Web 框架)
```

---

### Q2: Kamal 需要什么样的服务器？

**A**: 任何支持 Docker 的 Linux 服务器即可。

**推荐的 VPS 供应商：**
| 供应商 | 最低价格 | 推荐配置 | 说明 |
|--------|---------|---------|------|
| Hetzner | €4/月 ($5) | 2GB RAM, 1 CPU | 性价比最高 |
| DigitalOcean | $6/月 | 1GB RAM, 1 CPU | 界面友好 |
| Linode | $5/月 | 1GB RAM, 1 CPU | 稳定可靠 |
| Vultr | $6/月 | 1GB RAM, 1 CPU | 全球节点多 |

**最低配置要求：**
- 内存：1GB（推荐 2GB+）
- CPU：1 核心（推荐 2 核心）
- 存储：20GB
- 操作系统：Ubuntu 20.04+, Debian 10+, CentOS 8+

**你的项目推荐配置：**
```bash
# 单机部署 3 个应用
4GB RAM, 2 CPU, 80GB SSD
成本：约 $12/月

# 高可用部署（每个应用 3 台服务器）
3 × (2GB RAM, 1 CPU, 40GB SSD)
成本：约 $18/月
```

---

### Q3: 如何回滚到上一个版本？

**A**: 非常简单，一条命令即可。

```bash
cd /Users/wangshian/Desktop/work/local-life-server
kamal rollback
```

**工作原理：**
1. Kamal 保留上一个版本的容器镜像
2. 回滚时启动旧容器，停止新容器
3. 零停机切换
4. 整个过程约 30 秒

**注意事项：**
- ⚠️ 只能回滚应用代码，不能回滚数据库
- ⚠️ 如果数据库结构有变化，回滚前先手动处理

**如果需要回滚数据库：**
```bash
# 需要提前做好备份
ssh root@123.45.67.10
pg_restore -d myapp_production backup.sql
```

---

### Q4: Kamal 会自动备份数据库吗？

**A**: 不会。Kamal 只负责应用部署，数据库备份需要你自己配置。

**推荐方案 1：使用云数据库（最简单）**
```bash
# 使用 AWS RDS、Google Cloud SQL、DigitalOcean Managed Database
# 优点：自动备份、自动故障转移
# 缺点：价格稍贵（$15-50/月）
```

**推荐方案 2：使用 Kamal Accessories + 定时备份**
```yaml
# config/deploy.yml
accessories:
  db:
    image: postgres:15
    host: 123.45.67.10
    directories:
      - /var/lib/postgresql/data:/var/lib/postgresql/data

# 然后在服务器上配置 cron 定时备份
```

```bash
# 在服务器上设置每日备份
ssh root@123.45.67.10

# 添加备份脚本
cat > /usr/local/bin/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backups/postgres
mkdir -p $BACKUP_DIR
docker exec local-life-server-db pg_dump -U postgres myapp > \
  $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql
# 保留最近 7 天的备份
find $BACKUP_DIR -name "backup-*.sql" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-db.sh

# 添加到 crontab（每天凌晨 2 点备份）
echo "0 2 * * * /usr/local/bin/backup-db.sh" | crontab -
```

---

### Q5: 单台服务器能运行多少个应用？

**A**: 取决于服务器配置和应用资源使用。

**实际测试数据：**

| 服务器配置 | 轻量级应用 | 中等应用 | 重型应用 |
|-----------|----------|---------|---------|
| 2GB RAM | 3-4 个 | 2 个 | 1 个 |
| 4GB RAM | 6-8 个 | 4-5 个 | 2-3 个 |
| 8GB RAM | 12-15 个 | 8-10 个 | 4-6 个 |

**应用类型定义：**
- **轻量级**：静态网站、简单 API（< 200MB 内存）
- **中等**：NestJS、Express、小型 Rails（200-500MB）
- **重型**：大型 Rails、Django、带搜索的应用（> 500MB）

**你的项目示例：**
```yaml
# 4GB 服务器可以运行：
✅ local-life-server (NestJS)      - 400MB
✅ local-life-front (Vue.js SSR)   - 300MB
✅ shops (Express)                 - 300MB
✅ PostgreSQL                      - 500MB
✅ Redis                           - 100MB
-----------------------------------
总计：1.6GB / 4GB（还剩 2.4GB 缓冲）
```

**监控资源使用：**
```bash
# SSH 到服务器查看
ssh root@123.45.67.10
docker stats

# 输出示例：
# CONTAINER              CPU %    MEM USAGE / LIMIT
# local-life-server      2.5%     380MiB / 2GiB
# local-life-front       1.8%     280MiB / 1GiB
# shops                  1.2%     250MiB / 1GiB
```

---

### Q6: Kamal 支持 Windows 服务器吗？

**A**: 不支持。Kamal 只支持 Linux 服务器。

**支持的操作系统：**
- ✅ Ubuntu 20.04, 22.04, 24.04
- ✅ Debian 10, 11, 12
- ✅ CentOS 8+, Rocky Linux 8+
- ✅ Fedora 35+
- ❌ Windows Server
- ❌ macOS（可以作为控制端，但不能作为部署目标）

**如果你只有 Windows 服务器：**
- 方案 1：在 Windows Server 上安装 WSL2 + Docker（不推荐，性能差）
- 方案 2：购买 Linux VPS（推荐，$5/月起）

---

### Q7: 如何查看应用日志？

**A**: Kamal 提供了强大的日志查看功能。

**基本用法：**
```bash
cd /Users/wangshian/Desktop/work/local-life-server

# 查看实时日志
kamal app logs --follow

# 查看最近 100 行
kamal app logs --lines 100

# 查看最近 1 小时的日志
kamal app logs --since 1h

# 查看特定服务器的日志
kamal app logs --hosts=123.45.67.10

# 搜索日志中的错误
kamal app logs | grep ERROR
```

**查看附属服务日志：**
```bash
# 查看数据库日志
kamal accessory logs db

# 查看 Redis 日志
kamal accessory logs redis
```

**高级用法：**
```bash
# 持续监控错误日志
kamal app logs --follow | grep -E "ERROR|WARN"

# 导出日志到本地文件
kamal app logs --since 24h > logs-$(date +%Y%m%d).txt

# 查看最近的部署日志
kamal app logs --since "2024-02-09 10:00:00"
```

---

### Q8: Kamal 和 Docker Compose 有什么区别？

**A**: 两者服务不同场景，可以互补使用。

| 功能 | Kamal | Docker Compose |
|------|-------|----------------|
| **用途** | 生产部署 | 本地开发 |
| **多服务器** | ✅ 支持 | ❌ 单机 |
| **零停机部署** | ✅ 自动 | ❌ 需手动实现 |
| **SSL 证书** | ✅ 自动（Let's Encrypt） | ❌ 需手动配置 |
| **镜像构建** | ✅ 自动推送到仓库 | ✅ 本地构建 |
| **健康检查** | ✅ 内置流量切换 | ✅ 基础支持 |
| **回滚** | ✅ 一键回滚 | ❌ 需手动操作 |
| **学习曲线** | ⭐⭐ 中等 | ⭐ 简单 |

**推荐的使用方式：**

```bash
# 本地开发：使用 Docker Compose
docker-compose up -d

# 生产部署：使用 Kamal
kamal deploy
```

**实际工作流：**
```bash
# 1. 本地开发（使用 docker-compose.yml）
cd /Users/wangshian/Desktop/work/local-life-server
docker-compose up

# 2. 测试通过后，部署到生产（使用 Kamal）
kamal deploy

# 两者可以共存，互不干扰
```

---

### Q9: Kamal 支持自动扩缩容吗？

**A**: 不支持自动扩缩容，但支持快速手动扩容。

**Kamal 的扩容方式：**
```bash
# 1. 编辑 config/deploy.yml，添加新服务器
servers:
  web:
    hosts:
      - 123.45.67.10
      - 123.45.67.11
      - 123.45.67.12  # 新增
      - 123.45.67.13  # 新增

# 2. 只部署到新服务器（不影响现有服务）
kamal deploy --hosts=123.45.67.12,123.45.67.13

# 3. 完成！新服务器自动加入负载均衡
```

**对比其他方案：**

| 方案 | 扩容方式 | 扩容时间 | 适用场景 |
|------|---------|---------|---------|
| Kamal | 手动 | 3-5 分钟 | 流量可预测 |
| Kubernetes | 自动 | 30-60 秒 | 流量波动大 |
| AWS Auto Scaling | 自动 | 1-2 分钟 | 突发流量 |

**什么情况下需要自动扩容？**
- ❌ 流量稳定（日常 1000 req/min，高峰 3000 req/min）→ Kamal 足够
- ✅ 流量暴涨（日常 1000 req/min，突然 50000 req/min）→ 需要自动扩容

**Kamal 的应对策略：**
```bash
# 提前准备：过量配置
# 平时流量 1000 req/min，准备 3 台服务器
# 每台能处理 2000 req/min，总计 6000 req/min
# 可应对 3 倍流量增长
```

---

### Q10: 如何设置环境变量？

**A**: Kamal 支持三种方式设置环境变量。

**方式 1：通过环境变量（推荐，最安全）**

```yaml
# config/deploy.yml
env:
  secret:
    - DATABASE_URL
    - JWT_SECRET
  clear:
    NODE_ENV: production
```

```bash
# 部署前设置环境变量
export DATABASE_URL="postgres://..."
export JWT_SECRET="your-secret"

# 然后部署
kamal deploy
```

**方式 2：使用 .env 文件（方便，但不要提交到 Git）**

```bash
# 创建 .env 文件
cat > .env << 'EOF'
DATABASE_URL=postgres://...
JWT_SECRET=your-secret
EOF

# 添加到 .gitignore
echo ".env" >> .gitignore

# 部署时自动读取
kamal deploy
```

**方式 3：使用密码管理器（最安全，适合团队）**

```yaml
# config/deploy.yml
env:
  secret:
    - DATABASE_URL
    - JWT_SECRET

# 使用 1Password、Bitwarden 等
kamal deploy
# Kamal 会从密码管理器读取
```

**环境变量类型：**
- `secret`: 敏感信息（密码、密钥），不会出现在日志中
- `clear`: 普通配置，会出现在日志中

---

### Q11: 如何实现 HTTPS？

**A**: Kamal 通过 Let's Encrypt 自动配置 HTTPS，零配置。

```yaml
# config/deploy.yml
proxy:
  ssl: true                    # 启用 SSL
  host: api.local-life.com     # 你的域名
```

**工作原理：**
1. Kamal Proxy 自动向 Let's Encrypt 申请证书
2. 自动配置 HTTPS 重定向（HTTP → HTTPS）
3. 自动续期证书（每 60 天）
4. 支持多域名

**多域名配置：**
```yaml
# 同一台服务器，多个应用，多个域名
# local-life-server
proxy:
  host: api.local-life.com
  ssl: true

# local-life-front
proxy:
  host: www.local-life.com
  ssl: true

# 每个域名都会自动获得 SSL 证书
```

**注意事项：**
- ⚠️ 域名必须先解析到服务器 IP
- ⚠️ 服务器防火墙需要开放 80 和 443 端口
- ⚠️ Let's Encrypt 有速率限制（每周最多 50 个证书）

---

### Q12: 如何部署多个环境（开发/测试/生产）？

**A**: 使用不同的配置文件或目标（destination）。

**方法 1：使用不同的配置文件**

```bash
# 创建多个配置文件
config/deploy.yml              # 生产环境
config/deploy.staging.yml      # 测试环境
config/deploy.development.yml  # 开发环境
```

```bash
# 部署到不同环境
kamal deploy                                    # 生产
kamal deploy -c config/deploy.staging.yml      # 测试
kamal deploy -c config/deploy.development.yml  # 开发
```

**方法 2：使用 destinations（推荐）**

```yaml
# config/deploy.yml
service: local-life-server
image: wangshian/local-life-server

# 生产环境
servers:
  web:
    hosts:
      - 123.45.67.10

# 在文件末尾添加其他环境
---
destination: staging
servers:
  web:
    hosts:
      - 123.45.67.100

proxy:
  host: staging.local-life.com

---
destination: development
servers:
  web:
    hosts:
      - 123.45.67.200

proxy:
  host: dev.local-life.com
```

```bash
# 部署到不同环境
kamal deploy                    # 生产
kamal deploy -d staging         # 测试
kamal deploy -d development     # 开发
```

---

### Q13: Kamal 部署失败怎么办？

**A**: 查看[故障排查](#故障排查)章节，常见问题及解决方案都在那里。

**快速诊断：**
```bash
# 1. 检查应用状态
kamal app status

# 2. 查看错误日志
kamal app logs --lines 100

# 3. 检查服务器连接
ssh root@YOUR_SERVER_IP

# 4. 检查 Docker 状态
docker ps -a
```

**最常见的问题：**
1. 健康检查失败 → 检查 `/health` 端点
2. SSH 连接失败 → 检查 SSH 密钥
3. Docker 镜像拉取失败 → 检查 Docker Hub 凭证

详细解决方案请查看 FAQ 底部的故障排查部分。

---

## 故障排查

### 问题 1：健康检查超时

**症状：**
```bash
[ERROR] Healthcheck failed after 7 attempts
[ERROR] Container failed to become healthy
```

**可能原因：**
1. 应用启动时间过长（超过 70 秒）
2. 健康检查端点不存在或返回非 200 状态
3. 应用端口配置错误
4. 防火墙阻止内部通信

**解决方法：**

```yaml
# 方案 1：增加健康检查尝试次数和间隔
proxy:
  healthcheck:
    path: /health
    max_attempts: 15      # 从 7 增加到 15
    interval: 20          # 从 10 秒增加到 20 秒
    timeout: 10s          # 增加超时时间
```

```bash
# 方案 2：检查应用是否正确实现健康检查
ssh root@123.45.67.10
docker logs local-life-server-web

# 方案 3：手动测试健康检查
curl -I http://localhost:3000/health
# 应该返回 HTTP/1.1 200 OK
```

**NestJS 健康检查实现：**
```typescript
// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/health')
  check() {
    return { status: 'ok', timestamp: Date.now() };
  }
}
```

---

### 问题 2：SSH 连接失败

**症状：**
```bash
[ERROR] SSH authentication failed for root@123.45.67.10
[ERROR] Permission denied (publickey)
```

**解决方法：**

```bash
# 步骤 1：测试 SSH 连接
ssh root@123.45.67.10

# 如果失败，添加 SSH 密钥
ssh-copy-id root@123.45.67.10
# 输入服务器密码

# 步骤 2：验证密钥已添加
ssh root@123.45.67.10
# 应该无需密码直接登录

# 步骤 3：如果还是失败，检查 SSH 配置
ssh -v root@123.45.67.10
# 查看详细的连接日志
```

**使用自定义 SSH 密钥：**
```yaml
# config/deploy.yml
ssh:
  user: deploy              # 使用非 root 用户
  keys:
    - ~/.ssh/id_rsa_deploy  # 指定密钥路径
```

---

### 问题 3：Docker 镜像拉取失败

**症状：**
```bash
[ERROR] Failed to pull image wangshian/local-life-server
[ERROR] unauthorized: authentication required
```

**解决方法：**

```bash
# 步骤 1：测试 Docker Hub 登录
docker login
# 输入用户名和密码

# 步骤 2：确保环境变量正确
echo $KAMAL_REGISTRY_PASSWORD
# 应该输出你的密码

# 如果没有输出，设置环境变量
export KAMAL_REGISTRY_PASSWORD=your-dockerhub-password

# 步骤 3：重新部署
cd /Users/wangshian/Desktop/work/local-life-server
kamal deploy
```

**使用其他镜像仓库：**
```yaml
# 使用 GitHub Container Registry
registry:
  server: ghcr.io
  username: your-github-username
  password:
    - KAMAL_REGISTRY_PASSWORD

image: ghcr.io/your-github-username/local-life-server
```

---

### 问题 4：端口冲突

**症状：**
```bash
[ERROR] Port 443 is already in use
[ERROR] Cannot start proxy
```

**解决方法：**

```bash
# 查看端口占用
ssh root@123.45.67.10
netstat -tulpn | grep :443

# 停止占用端口的进程
# 如果是旧的 Kamal Proxy
docker stop kamal-proxy
docker rm kamal-proxy

# 如果是 Nginx
sudo systemctl stop nginx

# 重新部署
kamal proxy reboot
```

---

### 问题 5：磁盘空间不足

**症状：**
```bash
[ERROR] No space left on device
[ERROR] Failed to build image
```

**解决方法：**

```bash
# 连接到服务器
ssh root@123.45.67.10

# 检查磁盘使用情况
df -h

# 清理旧的 Docker 镜像和容器
docker system prune -a --volumes -f

# 清理 Kamal 缓存
rm -rf /tmp/kamal-*

# 查看清理后的空间
df -h
```

**预防措施：**
```bash
# 定期清理（添加到 crontab）
0 2 * * 0 docker system prune -a -f
```

---

### 问题 6：数据库连接失败

**症状：**
```bash
[ERROR] Could not connect to database
[ERROR] Connection refused
```

**解决方法：**

```bash
# 检查数据库容器状态
ssh root@123.45.67.10
docker ps | grep postgres

# 查看数据库日志
docker logs local-life-server-db

# 测试数据库连接
docker exec -it local-life-server-db psql -U postgres
```

**常见原因：**
1. 数据库容器未启动
2. 环境变量配置错误
3. 数据库密码不匹配

**检查配置：**
```yaml
# config/deploy.yml
env:
  secret:
    - DATABASE_URL

# 确保 DATABASE_URL 格式正确
# postgres://username:password@host:5432/database
```

---

### 需要更多帮助？

如果以上方法都无法解决你的问题：

1. 📖 查看[官方文档](https://kamal-deploy.org/docs/)
2. 💬 在 [GitHub Discussions](https://github.com/basecamp/kamal/discussions) 提问
3. 🐛 在 [GitHub Issues](https://github.com/basecamp/kamal/issues) 报告 Bug
4. 📚 搜索现有的 Issues，可能已有解决方案

## 总结

Kamal 为现代 Web 应用提供了一个优雅的部署解决方案，在**简单性、成本和功能性之间取得了完美平衡**。

### 🎯 Kamal 特别适合：

**你的实际场景：**
- 有多个小项目需要部署（如 local-life-server、local-life-front、shops）
- 团队规模 < 10 人，没有专职运维
- 预算有限（月成本 < $100）
- 流量相对稳定（日活 < 100 万）
- 追求快速上线和简单运维

### 📊 核心优势回顾：

| 维度 | Kamal | Heroku (PaaS) | Kubernetes |
|------|-------|--------------|-----------|
| **成本** | $10-50/月 | $75-300/月 | $150-500/月 |
| **学习时间** | 1-2 小时 | 30 分钟 | 40-80 小时 |
| **部署时间** | 5 分钟 | 2 分钟 | 数天配置 |
| **单机多应用** | ✅ 支持 | ❌ | ❌ |
| **自动扩容** | ❌ | ✅ | ✅ |
| **适用规模** | 小到中型 | 小到中型 | 任意规模 |

### 🚀 下一步行动：

**如果你刚接触 Kamal：**
1. ⚡ 阅读[快速开始（5 分钟）](#快速开始5-分钟)，立即体验
2. 📖 查看[实际应用场景](#实际应用场景)，找到类似你的项目
3. 💡 浏览[常见问题 FAQ](#常见问题-faq)，了解常见情况

**如果你准备在生产环境使用：**
1. 🔐 配置好[环境变量和密钥管理](#1-使用环境变量管理密钥)
2. 💪 学习[水平扩展与缩容](#水平扩展与缩容)应对流量增长
3. 🔧 收藏[故障排查](#故障排查)章节以备不时之需

### 💬 最后的话

Kamal 的设计哲学是：**让部署变得简单，而不是简陋**。它不会像 Kubernetes 那样提供所有功能，但它提供的功能都经过精心打磨，足以满足 80% 的 Web 应用需求。

对于你的项目（local-life-server、shops 等），Kamal 是最佳选择：
- ✅ 成本最优：3 个应用共享一台 $10/月 的服务器
- ✅ 维护简单：不需要学习复杂的 K8s 概念
- ✅ 功能完整：零停机部署、自动 HTTPS、健康检查
- ✅ 随时扩展：流量增长时可快速手动扩容

**随着 Kamal 2 的发布，这个工具变得更加强大和灵活，是 2026 年中小型项目部署的首选工具。**

祝你部署顺利！🎉

## 参考资源

**官方资源：**
- [Kamal 官方网站](https://kamal-deploy.org/)
- [Kamal GitHub 仓库](https://github.com/basecamp/kamal)
- [Kamal 官方文档](https://kamal-deploy.org/docs/installation/)
- [Kamal 命令参考](https://kamal-deploy.org/docs/commands/view-all-commands/)
- [Kamal Proxy 仓库](https://github.com/basecamp/kamal-proxy)
- [37signals 开发博客 - Kamal 2.0 发布](https://dev.37signals.com/kamal-2/)

**教程和指南：**
- [DHH 关于 Kamal 的介绍](https://world.hey.com/dhh/introducing-kamal-9330a267)
- [Kamal 健康检查设置详解](https://nts.strzibny.name/kamal-healthcheck-settings/)
- [使用 Kamal 2 在单服务器运行多应用](https://nts.strzibny.name/multiple-apps-single-server-kamal-2/)
- [Honeybadger - Kamal 2 新特性详解](https://www.honeybadger.io/blog/new-in-kamal-2/)
