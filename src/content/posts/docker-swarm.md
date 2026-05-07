---
title: Docker Swarm 完全指南：从原理到生产实践
published: 2026-02-09
description: 深入解析 Docker Swarm 原生容器编排工具，涵盖集群架构、Raft 共识算法、服务调度、路由网格、高可用部署等核心概念。对比 Kubernetes，探讨 Swarm 的适用场景与最佳实践。
tags: [Docker Swarm, Docker, 容器编排, 集群管理, DevOps, 微服务, 负载均衡]
category: DevOps
draft: false
---

Docker Swarm 是 Docker 官方提供的原生容器编排工具，用于管理和编排多个 Docker 主机上的容器集群。它将多个 Docker 主机组成一个虚拟的主机池，提供高可用性、负载均衡和弹性扩展能力。

### 核心特性

- **原生集成**：无需额外安装，Docker Engine 内置 Swarm Mode
- **简单易用**：相比 Kubernetes，学习曲线更平缓
- **高可用性**：Manager 节点支持 Raft 共识算法，提供故障转移
- **声明式服务模型**：通过 desired state 管理服务
- **滚动更新**：支持零停机服务更新
- **服务发现**：内置 DNS 服务发现
- **负载均衡**：内置路由网格（Routing Mesh）
- **安全性**：TLS 加密通信和证书轮换

## 核心架构与原理

### 1. 集群架构

```
┌─────────────────────────────────────────────────────┐
│                   Swarm Cluster                      │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Manager 1  │  │   Manager 2  │  │  Manager 3 │ │
│  │   (Leader)   │◄─┤              │◄─┤            │ │
│  │              │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │        │
│         └─────────────────┼─────────────────┘        │
│                           │                          │
│         ┌─────────────────┴─────────────────┐        │
│         │                                   │        │
│  ┌──────▼──────┐  ┌──────────────┐  ┌──────▼──────┐ │
│  │   Worker 1  │  │   Worker 2   │  │   Worker 3  │ │
│  │             │  │              │  │             │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2. 节点类型

#### Manager 节点
- 维护集群状态（使用 Raft 共识算法）
- 调度服务到 Worker 节点
- 处理 Swarm 管理任务
- 可以同时作为 Worker 节点运行容器

#### Worker 节点
- 运行容器任务
- 向 Manager 节点报告任务状态
- 不参与集群管理决策

### 3. Raft 共识算法

Docker Swarm 使用 Raft 算法确保 Manager 节点之间的状态一致性：

- **Leader Election**：自动选举一个 Leader Manager
- **Log Replication**：所有写操作通过 Leader 同步到其他 Manager
- **容错能力**：可以容忍 `(N-1)/2` 个节点失败（N 为 Manager 数量）

推荐配置：
- 1 个 Manager：无容错（测试环境）
- 3 个 Manager：容忍 1 个失败
- 5 个 Manager：容忍 2 个失败
- 7 个 Manager：容忍 3 个失败（通常上限）

### 4. 服务调度原理

Swarm 调度器根据以下策略分配任务：

1. **资源约束**：检查节点可用资源（CPU、内存）
2. **放置约束**：满足 `--constraint` 条件
3. **放置偏好**：根据 `--placement-pref` 分散或集中任务
4. **调度策略**：
   - **Spread**：尽量分散到不同节点（默认）
   - **Binpack**：尽量填满节点再使用下一个节点

### 5. Routing Mesh（路由网格）

所有节点参与 Ingress 网络，实现负载均衡：

```
外部请求 → 任意节点:发布端口 → Routing Mesh → 后端容器
```

- 任何节点都可以接收发布端口的请求
- 自动路由到运行服务容器的节点
- 使用 IPVS（Linux Virtual Server）实现

## 核心概念详解

### 1. 节点（Node）

节点是 Swarm 集群中的 Docker Engine 实例。

```bash
# 查看节点
docker node ls

# 查看节点详情
docker node inspect <node-id>

# 更新节点标签
docker node update --label-add env=production node1

# 设置节点可用性
docker node update --availability drain node1  # 停止分配新任务
docker node update --availability active node1  # 激活节点
docker node update --availability pause node1   # 暂停（已有任务继续运行）
```

### 2. 服务（Service）

服务是在 Swarm 集群中运行的容器定义。

#### 两种服务模式

**Replicated Services**（副本服务）：
```bash
docker service create --name web --replicas 3 nginx
```

**Global Services**（全局服务）：每个节点运行一个任务
```bash
docker service create --name monitor --mode global node-exporter
```

### 3. 任务（Task）

任务是 Swarm 中最小的调度单位，一个任务包含一个容器。

### 4. 网络

#### Overlay 网络
跨主机容器通信：

```bash
docker network create --driver overlay my-overlay
```

#### Ingress 网络
处理服务发布端口的特殊 overlay 网络。

### 5. 配置和密钥

#### Config
非敏感配置数据：

```bash
echo "server { listen 80; }" | docker config create nginx-config -
docker service create --config src=nginx-config,target=/etc/nginx/nginx.conf nginx
```

#### Secret
敏感数据（加密存储）：

```bash
echo "mypassword" | docker secret create db-password -
docker service create --secret db-password mysql
```

## 快速入门

### 环境准备

准备 3 台服务器（虚拟机或云主机）：
- Manager: 192.168.1.10
- Worker1: 192.168.1.11
- Worker2: 192.168.1.12

### 初始化 Swarm

在 Manager 节点：

```bash
# 初始化 Swarm
docker swarm init --advertise-addr 192.168.1.10

# 输出类似：
# Swarm initialized: current node (xyz) is now a manager.
# To add a worker to this swarm, run the following command:
#     docker swarm join --token SWMTKN-1-xxx 192.168.1.10:2377
```

### 加入节点

在 Worker 节点：

```bash
docker swarm join --token SWMTKN-1-xxx 192.168.1.10:2377
```

添加 Manager 节点：

```bash
# 在现有 Manager 上获取 token
docker swarm join-token manager

# 在新节点上执行输出的命令
docker swarm join --token SWMTKN-1-yyy 192.168.1.10:2377
```

### 部署第一个服务

```bash
# 创建服务
docker service create \
  --name web \
  --replicas 3 \
  --publish 8080:80 \
  nginx

# 查看服务
docker service ls
docker service ps web

# 扩容
docker service scale web=5

# 更新服务
docker service update --image nginx:alpine web

# 删除服务
docker service rm web
```

## 使用文档

### 服务管理

#### 创建服务

```bash
docker service create \
  --name my-web \
  --replicas 3 \
  --publish published=8080,target=80 \
  --env MYSQL_ROOT_PASSWORD=secret \
  --mount type=volume,source=my-vol,target=/data \
  --network my-overlay \
  --constraint 'node.labels.env==production' \
  --limit-cpu 0.5 \
  --limit-memory 512M \
  --reserve-cpu 0.25 \
  --reserve-memory 256M \
  --update-delay 10s \
  --update-parallelism 2 \
  --restart-condition on-failure \
  --restart-max-attempts 3 \
  nginx:alpine
```

参数说明：
- `--replicas`：副本数量
- `--publish`：发布端口
- `--env`：环境变量
- `--mount`：挂载卷或绑定目录
- `--network`：连接到网络
- `--constraint`：放置约束
- `--limit-*`：资源限制
- `--reserve-*`：资源预留
- `--update-*`：更新策略

#### 更新服务

```bash
# 更新镜像
docker service update --image nginx:1.19 my-web

# 添加端口
docker service update --publish-add 8443:443 my-web

# 更新环境变量
docker service update --env-add NEW_VAR=value my-web

# 更新副本数
docker service update --replicas 5 my-web

# 回滚
docker service rollback my-web
```

#### 查看服务

```bash
# 列出服务
docker service ls

# 查看服务详情
docker service inspect my-web

# 查看服务任务
docker service ps my-web

# 查看服务日志
docker service logs my-web
docker service logs -f --tail 100 my-web
```

### Stack 部署

使用 Docker Compose 文件部署整个应用栈。

```bash
# 部署 stack
docker stack deploy -c docker-compose.yml myapp

# 查看 stack
docker stack ls
docker stack services myapp
docker stack ps myapp

# 删除 stack
docker stack rm myapp
```

### 网络管理

```bash
# 创建 overlay 网络
docker network create \
  --driver overlay \
  --subnet 10.0.9.0/24 \
  --gateway 10.0.9.1 \
  my-network

# 加密网络
docker network create --driver overlay --opt encrypted my-secure-network

# 查看网络
docker network ls
docker network inspect my-network

# 删除网络
docker network rm my-network
```

### 配置管理

```bash
# 创建 config
docker config create nginx.conf ./nginx.conf

# 从标准输入创建
cat config.json | docker config create app-config -

# 列出 config
docker config ls

# 查看 config
docker config inspect nginx.conf

# 删除 config
docker config rm nginx.conf

# 在服务中使用
docker service create \
  --name web \
  --config source=nginx.conf,target=/etc/nginx/nginx.conf \
  nginx
```

### 密钥管理

```bash
# 创建 secret
echo "mypassword" | docker secret create db_password -

# 从文件创建
docker secret create db_root_password ./password.txt

# 列出 secret
docker secret ls

# 查看 secret（不显示内容）
docker secret inspect db_password

# 删除 secret
docker secret rm db_password

# 在服务中使用
docker service create \
  --name mysql \
  --secret db_password \
  --env MYSQL_ROOT_PASSWORD_FILE=/run/secrets/db_password \
  mysql:8
```

### 节点管理

```bash
# 查看节点
docker node ls

# 节点详情
docker node inspect node1

# 提升 Worker 为 Manager
docker node promote node1

# 降级 Manager 为 Worker
docker node demote node1

# 更新节点标签
docker node update --label-add type=compute node1
docker node update --label-add env=production node1

# 设置节点可用性
docker node update --availability drain node1

# 移除节点（在节点上执行）
docker swarm leave

# 强制移除节点（在 Manager 上）
docker node rm --force node1
```

## 复杂实战 Demo

下面我们部署一个完整的微服务应用，包含：
- Nginx 反向代理和负载均衡
- 3 个微服务（API、Web、Admin）
- PostgreSQL 主从复制
- Redis 集群
- 监控系统（Prometheus + Grafana）
- 日志收集（ELK Stack）
- 分布式追踪（Jaeger）

### 架构图

```
                           ┌─────────────┐
                           │   Traefik   │ (反向代理)
                           │  (ingress)  │
                           └──────┬──────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
          ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐
          │  API Service│  │ Web Service │  │Admin Service│
          │  (3 replicas)│  │ (2 replicas)│  │(1 replica) │
          └──────┬──────┘  └──────┬──────┘  └─────┬──────┘
                 │                │                │
                 └────────────────┼────────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 │                                  │
          ┌──────▼──────┐                  ┌────────▼────────┐
          │ PostgreSQL  │                  │  Redis Cluster  │
          │   Primary   │                  │   (3 nodes)     │
          │      +      │                  └─────────────────┘
          │  Replicas   │
          └─────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼────┐  ┌────▼───┐  ┌────▼───┐
│Prometheus││Grafana │  │ Jaeger │
└─────────┘  └────────┘  └────────┘
```

### 准备工作

创建目录结构：

```bash
mkdir -p swarm-demo/{api,web,admin,nginx,postgres,monitoring}
cd swarm-demo
```

### 1. 创建网络

```bash
# 前端网络（面向公网）
docker network create --driver overlay frontend

# 后端网络（内部服务）
docker network create --driver overlay --opt encrypted backend

# 监控网络
docker network create --driver overlay monitoring
```

### 2. PostgreSQL 高可用部署

创建 `postgres/docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres-primary:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
      POSTGRES_DB: appdb
      POSTGRES_INITDB_ARGS: "-E UTF8"
      # 主从复制配置
      POSTGRES_HOST_AUTH_METHOD: md5
    secrets:
      - db_password
    volumes:
      - postgres-primary-data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
      - ./postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    networks:
      - backend
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.db==primary
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 使用 PgPool-II 实现读写分离和连接池
  pgpool:
    image: pgpool/pgpool:4.4
    environment:
      - PGPOOL_BACKEND_NODES=0:postgres-primary:5432
      - PGPOOL_SR_CHECK_USER=admin
      - PGPOOL_SR_CHECK_PASSWORD_FILE=/run/secrets/db_password
      - PGPOOL_ENABLE_POOL_HBA=yes
      - PGPOOL_ENABLE_POOL_PASSWD=yes
    secrets:
      - db_password
    networks:
      - backend
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.role==worker
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "localhost", "-p", "9999"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-primary-data:

secrets:
  db_password:
    external: true

networks:
  backend:
    external: true
```

创建 `postgres/postgresql.conf`：

```conf
# 基本连接设置
listen_addresses = '*'
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 64MB

# WAL 配置（用于复制）
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 1GB

# 日志配置
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_statement = 'mod'
log_duration = on
```

创建 `postgres/pg_hba.conf`：

```conf
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             0.0.0.0/0               md5
host    replication     all             0.0.0.0/0               md5
```

### 3. Redis 高可用部署

创建 `docker-compose.redis.yml`：

```yaml
version: '3.8'

services:
  # Redis 主节点
  redis-master:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD:-changeme}
      --masterauth ${REDIS_PASSWORD:-changeme}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis-master-data:/data
    networks:
      - backend
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.cache==redis
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Redis 从节点
  redis-replica:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD:-changeme}
      --masterauth ${REDIS_PASSWORD:-changeme}
      --replicaof redis-master 6379
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    networks:
      - backend
    deploy:
      replicas: 2
      placement:
        max_replicas_per_node: 1
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Redis Sentinel 实现自动故障转移
  redis-sentinel:
    image: redis:7-alpine
    command: >
      sh -c "echo 'port 26379
      sentinel monitor mymaster redis-master 6379 2
      sentinel down-after-milliseconds mymaster 5000
      sentinel parallel-syncs mymaster 1
      sentinel failover-timeout mymaster 10000
      sentinel auth-pass mymaster ${REDIS_PASSWORD:-changeme}' > /etc/redis/sentinel.conf &&
      redis-sentinel /etc/redis/sentinel.conf"
    networks:
      - backend
    deploy:
      replicas: 3
      placement:
        max_replicas_per_node: 1

volumes:
  redis-master-data:

networks:
  backend:
    external: true
```

### 4. 微服务应用

创建 `docker-compose.app.yml`：

```yaml
version: '3.8'

services:
  api:
    image: myregistry/api:latest
    environment:
      DATABASE_URL: postgresql://admin@postgres-primary:5432/appdb
      REDIS_URL: redis://redis-1:6379
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
      JWT_SECRET_FILE: /run/secrets/jwt_secret
    secrets:
      - db_password
      - jwt_secret
    networks:
      - frontend
      - backend
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 5s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.example.com`)"
      - "traefik.http.services.api.loadbalancer.server.port=3000"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    image: myregistry/web:latest
    environment:
      API_URL: http://api:3000
    networks:
      - frontend
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`www.example.com`)"
      - "traefik.http.services.web.loadbalancer.server.port=80"

  admin:
    image: myregistry/admin:latest
    environment:
      DATABASE_URL: postgresql://admin@postgres-primary:5432/appdb
      DATABASE_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    networks:
      - frontend
      - backend
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role==manager
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.admin.rule=Host(`admin.example.com`)"
      - "traefik.http.services.admin.loadbalancer.server.port=8080"

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

networks:
  frontend:
    external: true
  backend:
    external: true
```

### 5. Traefik 反向代理

创建 `docker-compose.traefik.yml`：

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.dashboard=true"
      - "--providers.docker.swarmMode=true"
      - "--providers.docker.exposedByDefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--metrics.prometheus=true"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certificates:/letsencrypt
    networks:
      - frontend
      - monitoring
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role==manager
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.dashboard.rule=Host(`traefik.example.com`)"
        - "traefik.http.routers.dashboard.service=api@internal"
        - "traefik.http.routers.dashboard.middlewares=auth"
        - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$..."

volumes:
  traefik-certificates:

networks:
  frontend:
    external: true
  monitoring:
    external: true
```

### 6. 监控系统

创建 `docker-compose.monitoring.yml`：

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
    configs:
      - source: prometheus_config
        target: /etc/prometheus/prometheus.yml
    volumes:
      - prometheus-data:/prometheus
    networks:
      - monitoring
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role==manager

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD_FILE: /run/secrets/grafana_password
      GF_INSTALL_PLUGINS: grafana-piechart-panel
    secrets:
      - grafana_password
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - monitoring
      - frontend
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.grafana.rule=Host(`grafana.example.com`)"
        - "traefik.http.services.grafana.loadbalancer.server.port=3000"

  node-exporter:
    image: prom/node-exporter:latest
    command:
      - '--path.rootfs=/host'
    volumes:
      - /:/host:ro,rslave
    networks:
      - monitoring
    deploy:
      mode: global

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - monitoring
    deploy:
      mode: global

  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_ZIPKIN_HOST_PORT: :9411
    networks:
      - monitoring
      - backend
    deploy:
      replicas: 1
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.jaeger.rule=Host(`jaeger.example.com`)"
        - "traefik.http.services.jaeger.loadbalancer.server.port=16686"

volumes:
  prometheus-data:
  grafana-data:

configs:
  prometheus_config:
    external: true

secrets:
  grafana_password:
    external: true

networks:
  monitoring:
    external: true
  frontend:
    external: true
  backend:
    external: true
```

### 7. Prometheus 配置

创建 `monitoring/prometheus.yml`：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'docker'
    dns_sd_configs:
      - names:
          - 'tasks.cadvisor'
        type: 'A'
        port: 8080

  - job_name: 'node-exporter'
    dns_sd_configs:
      - names:
          - 'tasks.node-exporter'
        type: 'A'
        port: 9100

  - job_name: 'traefik'
    dns_sd_configs:
      - names:
          - 'tasks.traefik'
        type: 'A'
        port: 8080

  - job_name: 'api'
    dns_sd_configs:
      - names:
          - 'tasks.api'
        type: 'A'
        port: 3000
```

### 部署步骤

#### 1. 准备节点标签

```bash
# 标记数据库节点
docker node update --label-add db=primary manager1
docker node update --label-add db=replica worker1
docker node update --label-add db=replica worker2

# 标记缓存节点
docker node update --label-add cache=redis worker1
docker node update --label-add cache=redis worker2
```

#### 2. 创建密钥和配置

```bash
# 创建密钥
echo "your-db-password" | docker secret create db_password -
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "admin-password" | docker secret create grafana_password -

# 创建配置
docker config create prometheus_config monitoring/prometheus.yml
```

#### 3. 部署服务

```bash
# 部署数据库
docker stack deploy -c postgres/docker-compose.yml db

# 部署 Redis
docker stack deploy -c docker-compose.redis.yml cache

# 等待数据库就绪，然后部署应用
docker stack deploy -c docker-compose.app.yml app

# 部署反向代理
docker stack deploy -c docker-compose.traefik.yml proxy

# 部署监控
docker stack deploy -c docker-compose.monitoring.yml monitoring
```

#### 4. 验证部署

```bash
# 查看所有 stack
docker stack ls

# 查看服务状态
docker service ls

# 查看特定服务的任务
docker service ps app_api

# 查看日志
docker service logs -f app_api
```

#### 5. 扩缩容

```bash
# 扩容 API 服务
docker service scale app_api=5

# 缩容
docker service scale app_api=2

# 使用 compose 文件更新
# 修改 docker-compose.app.yml 中的 replicas 值
docker stack deploy -c docker-compose.app.yml app
```

#### 6. 滚动更新

```bash
# 更新 API 服务镜像
docker service update --image myregistry/api:v2.0 app_api

# 带参数的更新
docker service update \
  --image myregistry/api:v2.0 \
  --update-parallelism 2 \
  --update-delay 30s \
  app_api

# 回滚
docker service rollback app_api
```

### 健康检查脚本

创建 `api/healthcheck.sh`：

```bash
#!/bin/sh
set -e

# 检查数据库连接
if ! pg_isready -h postgres-primary -U admin; then
  echo "Database not ready"
  exit 1
fi

# 检查 Redis 连接
if ! redis-cli -h redis-1 ping | grep -q PONG; then
  echo "Redis not ready"
  exit 1
fi

# 检查应用健康
if ! curl -f http://localhost:3000/health; then
  echo "Application not healthy"
  exit 1
fi

echo "All health checks passed"
exit 0
```

### 监控告警

创建 `monitoring/alertmanager.yml`：

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack'

receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts'
        title: 'Swarm Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'cluster']
```

### 快速体验版 Demo

如果你想快速体验 Swarm，这里提供一个简化的可运行示例，部署一个带负载均衡的 Web 应用。

#### 1. 创建简单的 Web 应用

创建 `simple-app/app.js`：

```javascript
const http = require('http');
const os = require('os');

const port = process.env.PORT || 3000;
const hostname = os.hostname();

const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Docker Swarm Demo</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          background: rgba(255,255,255,0.1);
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        }
        h1 { margin-top: 0; }
        .info { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 5px; margin: 10px 0; }
        .highlight { color: #ffd700; font-weight: bold; }
      </style>
      <script>
        setInterval(() => location.reload(), 5000);
      </script>
    </head>
    <body>
      <div class="container">
        <h1>🐳 Docker Swarm 负载均衡演示</h1>
        <div class="info">
          <p><strong>容器主机名:</strong> <span class="highlight">${hostname}</span></p>
          <p><strong>请求时间:</strong> ${timestamp}</p>
          <p><strong>访问计数:</strong> 页面每 5 秒自动刷新</p>
        </div>
        <p>💡 刷新页面观察主机名变化，体验负载均衡效果</p>
      </div>
    </body>
    </html>
  `);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}, hostname: ${hostname}`);
});
```

创建 `simple-app/Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY app.js .
EXPOSE 3000
CMD ["node", "app.js"]
```

创建 `simple-app/package.json`：

```json
{
  "name": "swarm-demo-app",
  "version": "1.0.0",
  "description": "Docker Swarm Demo Application",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  }
}
```

#### 2. 构建和部署

```bash
# 1. 构建镜像
cd simple-app
docker build -t swarm-demo-app:v1 .

# 2. 如果是多节点集群，需要推送到 registry 或在每个节点构建
# docker tag swarm-demo-app:v1 your-registry/swarm-demo-app:v1
# docker push your-registry/swarm-demo-app:v1

# 3. 部署服务
docker service create \
  --name web \
  --replicas 5 \
  --publish published=8080,target=3000 \
  --update-delay 10s \
  --update-parallelism 2 \
  --rollback-parallelism 2 \
  --health-cmd "wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1" \
  --health-interval 10s \
  --health-timeout 5s \
  --health-retries 3 \
  swarm-demo-app:v1

# 4. 查看服务状态
docker service ps web

# 5. 访问应用
# 浏览器打开 http://任意节点IP:8080
# 多次刷新观察容器主机名变化
```

#### 3. 完整的 Stack 部署方式

创建 `simple-stack.yml`：

```yaml
version: '3.8'

services:
  web:
    image: swarm-demo-app:v1
    ports:
      - "8080:3000"
    deploy:
      replicas: 5
      update_config:
        parallelism: 2
        delay: 10s
        failure_action: rollback
        order: start-first
      rollback_config:
        parallelism: 2
        delay: 5s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
        reservations:
          cpus: '0.1'
          memory: 64M
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - webnet

  visualizer:
    image: dockersamples/visualizer:latest
    ports:
      - "8081:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    deploy:
      placement:
        constraints:
          - node.role==manager
    networks:
      - webnet

networks:
  webnet:
    driver: overlay
```

部署 Stack：

```bash
# 部署
docker stack deploy -c simple-stack.yml demo

# 查看服务
docker stack services demo
docker stack ps demo

# 访问可视化界面
# 打开 http://manager-ip:8081 查看集群状态

# 扩容
docker service scale demo_web=10

# 更新应用（假设你构建了 v2 版本）
docker service update --image swarm-demo-app:v2 demo_web

# 移除 stack
docker stack rm demo
```

#### 4. 压力测试

使用 Apache Bench 测试负载均衡：

```bash
# 安装 ab（如果没有）
# Ubuntu/Debian: sudo apt-get install apache2-utils
# macOS: 已预装
# CentOS/RHEL: sudo yum install httpd-tools

# 发送 10000 个请求，并发 100
ab -n 10000 -c 100 http://localhost:8080/

# 观察请求分布
docker service logs demo_web | grep "Server running" | sort | uniq -c

# 实时监控服务
watch -n 1 'docker service ps demo_web'
```

#### 5. 测试滚动更新

修改 `app.js`，更改背景颜色：

```javascript
// 将 background 从紫色渐变改为蓝色渐变
background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
```

重新构建并更新：

```bash
# 构建 v2 版本
docker build -t swarm-demo-app:v2 .

# 滚动更新（观察零停机更新）
docker service update \
  --image swarm-demo-app:v2 \
  --update-delay 5s \
  --update-parallelism 1 \
  demo_web

# 在另一个终端持续访问，观察更新过程
while true; do curl -s http://localhost:8080/ | grep hostname; sleep 1; done

# 如果有问题，立即回滚
docker service rollback demo_web
```

#### 6. 测试故障恢复

```bash
# 找到一个运行的容器
docker ps | grep demo_web

# 强制删除容器，模拟故障
docker rm -f <container-id>

# 观察 Swarm 自动重启容器
docker service ps demo_web

# 查看事件
docker events --filter service=demo_web
```

## 最佳实践

### 1. 集群规划

- **Manager 节点数量**：推荐 3 或 5 个，奇数以支持 Raft 共识
- **资源隔离**：使用节点标签分离不同类型的工作负载
- **高可用**：关键服务部署多个副本，分散在不同节点

### 2. 安全性

```bash
# 加密 overlay 网络
docker network create --driver overlay --opt encrypted secure-net

# 定期轮换证书
docker swarm ca --rotate

# 使用 Secret 管理敏感信息
echo "password" | docker secret create db_pass -

# 限制 Manager 节点也运行任务
docker node update --availability drain manager1
```

### 3. 资源管理

```bash
# 总是设置资源限制和预留
docker service create \
  --limit-cpu 1 \
  --limit-memory 512M \
  --reserve-cpu 0.5 \
  --reserve-memory 256M \
  nginx
```

### 4. 更新策略

```bash
# 使用 start-first 避免服务中断
docker service create \
  --update-order start-first \
  --update-parallelism 1 \
  --update-delay 10s \
  --update-failure-action rollback \
  nginx
```

### 5. 健康检查

总是定义健康检查：

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 6. 日志管理

```bash
# 使用日志驱动
docker service create \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  nginx

# 或使用集中式日志
docker service create \
  --log-driver gelf \
  --log-opt gelf-address=udp://logstash:12201 \
  nginx
```

### 7. 备份策略

```bash
# 备份 Swarm 状态（在 Manager 节点）
systemctl stop docker
tar -czf swarm-backup-$(date +%Y%m%d).tar.gz /var/lib/docker/swarm
systemctl start docker

# 备份卷数据
docker run --rm \
  -v postgres-data:/source \
  -v /backup:/backup \
  alpine tar -czf /backup/postgres-$(date +%Y%m%d).tar.gz -C /source .
```

### 8. 放置约束

```yaml
deploy:
  placement:
    constraints:
      - node.role==worker        # 只在 worker 节点
      - node.labels.env==prod    # 只在有此标签的节点
      - engine.labels.storage==ssd  # 引擎标签
    preferences:
      - spread: node.labels.zone # 跨区域分散
```

### 9. 网络最佳实践

- 使用多个 overlay 网络隔离不同层级服务
- 加密敏感网络流量
- 为高流量服务使用 `host` 模式或 `--publish mode=host`

### 10. 监控指标

关注以下关键指标：
- 节点 CPU、内存、磁盘使用率
- 服务副本健康状态
- 容器重启次数
- 网络流量
- 存储 I/O

### 11. 生产环境检查清单

部署到生产环境前，确保完成以下检查：

#### 集群配置
- [ ] Manager 节点数量为奇数（3 或 5）
- [ ] Manager 节点分布在不同的物理主机/可用区
- [ ] 所有节点时间同步配置正确（NTP）
- [ ] 防火墙规则已正确配置（2377, 7946, 4789）
- [ ] 已设置节点标签用于服务调度

#### 安全性
- [ ] 所有敏感数据使用 Docker Secret 存储
- [ ] Overlay 网络启用加密
- [ ] 定期轮换 TLS 证书
- [ ] 限制 Manager 节点不运行业务容器
- [ ] 配置 Docker daemon 的审计日志
- [ ] 使用私有 Registry 存储镜像
- [ ] 启用 Docker Content Trust (DCT)

#### 服务配置
- [ ] 所有服务设置资源限制（CPU、内存）
- [ ] 关键服务副本数 ≥ 3
- [ ] 配置健康检查
- [ ] 设置合理的重启策略
- [ ] 配置滚动更新策略（parallelism, delay）
- [ ] 设置更新失败时的回滚策略

#### 网络
- [ ] 为不同层级服务创建独立的 overlay 网络
- [ ] 敏感服务使用加密网络
- [ ] 配置适当的 DNS 设置
- [ ] 测试跨节点网络连通性

#### 存储
- [ ] 使用命名卷而非绑定挂载
- [ ] 配置卷备份策略
- [ ] 对于有状态服务，使用约束固定节点
- [ ] 考虑使用外部存储驱动（NFS、Ceph等）

#### 监控和日志
- [ ] 部署 Prometheus + Grafana
- [ ] 配置告警规则和通知渠道
- [ ] 集中式日志收集（ELK、Loki等）
- [ ] 设置日志轮转和保留策略
- [ ] 配置分布式追踪（可选）

#### 备份和恢复
- [ ] 定期备份 Swarm 状态（/var/lib/docker/swarm）
- [ ] 备份数据卷
- [ ] 备份配置文件和密钥
- [ ] 测试恢复流程
- [ ] 文档化灾难恢复步骤

#### 高可用性
- [ ] 数据库使用主从复制或集群
- [ ] 缓存使用哨兵或集群模式
- [ ] 测试节点故障场景
- [ ] 测试网络分区场景
- [ ] 配置健康检查和自动故障转移

### 12. 常见架构模式

#### 模式 1：三层 Web 应用

```
┌──────────────────────────────────────┐
│  负载均衡层 (Traefik/Nginx)           │
│  - 2+ 副本                            │
│  - 放置在边缘节点                     │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│  应用层 (API/Backend)                 │
│  - 3+ 副本                            │
│  - 分散在 Worker 节点                 │
│  - 连接到 frontend + backend 网络     │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│  数据层 (DB/Cache)                    │
│  - 主从复制 / 集群模式                │
│  - 固定节点部署                       │
│  - 仅连接 backend 网络                │
└──────────────────────────────────────┘
```

#### 模式 2：微服务架构

```
         ┌─────────────┐
         │ API Gateway │
         └──────┬──────┘
                │
      ┌─────────┼─────────┐
      │         │         │
   ┌──▼──┐   ┌──▼──┐   ┌──▼──┐
   │User │   │Order│   │Pay  │
   │Svc  │   │Svc  │   │Svc  │
   └──┬──┘   └──┬──┘   └──┬──┘
      │         │         │
      └─────────┼─────────┘
                │
         ┌──────▼──────┐
         │ Message Bus │
         │  (RabbitMQ) │
         └─────────────┘
```

部署配置：

```yaml
version: '3.8'

services:
  gateway:
    image: api-gateway
    networks:
      - frontend
      - backend
    deploy:
      replicas: 2

  user-service:
    image: user-service
    networks:
      - backend
      - database
    deploy:
      replicas: 3

  order-service:
    image: order-service
    networks:
      - backend
      - database
      - message
    deploy:
      replicas: 3

  payment-service:
    image: payment-service
    networks:
      - backend
      - message
    deploy:
      replicas: 2

  rabbitmq:
    image: rabbitmq:management
    networks:
      - message
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.labels.mq==true

networks:
  frontend:
    driver: overlay
  backend:
    driver: overlay
    driver_opts:
      encrypted: "true"
  database:
    driver: overlay
    driver_opts:
      encrypted: "true"
  message:
    driver: overlay
```

#### 模式 3：边缘计算

```
┌─────────────────────────────────────┐
│  边缘节点                            │
│  ┌───────────┐  ┌───────────┐      │
│  │IoT Gateway│  │Data Cache │      │
│  │(Global)   │  │(Global)   │      │
│  └───────────┘  └───────────┘      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  中心节点                            │
│  ┌─────────┐  ┌──────┐  ┌───────┐ │
│  │Analytics│  │Storage│  │Control│ │
│  │         │  │       │  │Panel  │ │
│  └─────────┘  └──────┘  └───────┘ │
└─────────────────────────────────────┘
```

使用全局服务部署边缘组件：

```bash
# 在所有节点部署数据采集器
docker service create \
  --name iot-collector \
  --mode global \
  --mount type=bind,source=/dev,target=/dev \
  --network edge \
  iot-collector:latest

# 在边缘节点部署本地缓存
docker service create \
  --name edge-cache \
  --mode global \
  --constraint 'node.labels.type==edge' \
  --network edge \
  redis:alpine
```

## 故障排查

### 常见问题

#### 1. 节点无法加入集群

```bash
# 检查防火墙端口
# TCP 2377 (集群管理)
# TCP/UDP 7946 (节点通信)
# UDP 4789 (overlay 网络)

# 检查时间同步
timedatectl status

# 重新生成 join token
docker swarm join-token worker
```

#### 2. 服务无法启动

```bash
# 查看服务详情
docker service ps --no-trunc <service-name>

# 查看任务日志
docker service logs <service-name>

# 检查约束条件
docker service inspect <service-name> | jq '.[0].Spec.TaskTemplate.Placement'

# 检查节点资源
docker node inspect <node-id> | jq '.[0].Description.Resources'
```

#### 3. 网络问题

```bash
# 检查 overlay 网络
docker network inspect <network-name>

# 在容器内测试连接
docker exec <container-id> ping <service-name>
docker exec <container-id> nslookup <service-name>

# 检查 iptables 规则
iptables -t nat -L -n
```

#### 4. 存储问题

```bash
# 查看卷
docker volume ls
docker volume inspect <volume-name>

# 检查卷挂载
docker service inspect <service-name> | jq '.[0].Spec.TaskTemplate.ContainerSpec.Mounts'

# 清理未使用的卷
docker volume prune
```

#### 5. Manager 节点故障

```bash
# 如果 Leader 失败，会自动选举新 Leader

# 恢复失败的 Manager
# 1. 停止 Docker
systemctl stop docker

# 2. 从备份恢复
tar -xzf swarm-backup.tar.gz -C /

# 3. 启动 Docker
systemctl start docker

# 或者移除并重新加入
docker swarm leave --force
docker swarm join --token <manager-token> <manager-ip>:2377
```

#### 6. 服务更新卡住

```bash
# 检查更新状态
docker service inspect --pretty <service-name>

# 强制更新
docker service update --force <service-name>

# 回滚
docker service rollback <service-name>
```

### 调试命令

```bash
# 查看 Swarm 事件
docker events --filter type=service
docker events --filter type=node

# 检查服务约束是否满足
docker node ls -q | xargs docker node inspect \
  -f '{{ .ID }} {{ .Spec.Labels }}'

# 查找失败的任务
docker service ps --filter "desired-state=running" \
  --filter "desired-state=shutdown" <service-name>

# 导出服务配置
docker service inspect <service-name> > service-config.json

# 统计服务分布
docker service ps <service-name> --format "{{.Node}}" | sort | uniq -c
```

### 性能优化

#### 1. 调整内核参数

```bash
# /etc/sysctl.conf
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.ipv4.conf.all.forwarding=1
net.ipv4.neigh.default.gc_thresh1=8096
net.ipv4.neigh.default.gc_thresh2=12288
net.ipv4.neigh.default.gc_thresh3=16384

sysctl -p
```

#### 2. Docker daemon 优化

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 10,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
```

#### 3. 限制日志大小

```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Docker Swarm vs Kubernetes 详细对比

### 功能对比表

| 特性 | Docker Swarm | Kubernetes | 说明 |
|------|--------------|------------|------|
| **学习曲线** | ⭐⭐ 简单 | ⭐⭐⭐⭐⭐ 陡峭 | Swarm 几小时上手，K8s 需要数周 |
| **安装复杂度** | ⭐ 内置 | ⭐⭐⭐⭐ 复杂 | Swarm 一行命令，K8s 需要多个组件 |
| **配置语法** | Docker Compose | YAML + 多种资源 | Swarm 复用 Compose 语法 |
| **集群规模** | <1000 节点 | >5000 节点 | Swarm 适合中小规模 |
| **生态系统** | ⭐⭐ 较小 | ⭐⭐⭐⭐⭐ 丰富 | K8s 有大量工具和插件 |
| **服务发现** | DNS | DNS + Service | 两者都支持 |
| **负载均衡** | Routing Mesh | Ingress + Service | K8s 更灵活 |
| **自动伸缩** | ❌ 需手动 | ✅ HPA/VPA | K8s 支持自动扩缩容 |
| **存储编排** | Volume | PV/PVC/StorageClass | K8s 更强大 |
| **网络策略** | ⭐⭐ 基础 | ⭐⭐⭐⭐⭐ 高级 | K8s 网络策略更细粒度 |
| **监控集成** | 需自建 | 丰富的第三方工具 | K8s 生态更成熟 |
| **滚动更新** | ✅ 支持 | ✅ 支持 | 都支持零停机更新 |
| **健康检查** | ✅ 支持 | ✅ 支持 | K8s 有就绪和存活探针 |
| **配置管理** | Config/Secret | ConfigMap/Secret | 功能类似 |
| **有状态应用** | ⭐⭐ 基础支持 | ⭐⭐⭐⭐ StatefulSet | K8s 更适合有状态应用 |
| **多租户** | ❌ 不支持 | ✅ Namespace | K8s 支持资源隔离 |
| **RBAC** | ⭐⭐ 基础 | ⭐⭐⭐⭐⭐ 细粒度 | K8s 权限控制更强大 |
| **社区支持** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | K8s 社区更活跃 |
| **企业采用** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | K8s 已成为事实标准 |

### 适用场景

#### 选择 Docker Swarm 的场景

✅ **适合：**
- 小型到中型团队（<50 人）
- 中小规模应用（<100 个服务）
- 团队熟悉 Docker 和 Compose
- 需要快速上手和部署
- 运维资源有限
- 无状态应用为主
- 预算有限，无需专职 K8s 工程师
- 已有 Docker 基础设施
- 不需要复杂的网络策略
- 边缘计算场景（资源受限）

**示例场景：**
- 创业公司 MVP 产品
- 内部工具和管理系统
- 中小型电商平台
- 企业内部应用
- CI/CD 构建环境

#### 选择 Kubernetes 的场景

✅ **适合：**
- 大型团队和企业
- 大规模应用（100+ 个服务）
- 需要自动伸缩
- 复杂的微服务架构
- 有状态应用（数据库、消息队列）
- 多租户环境
- 需要细粒度的权限控制
- 混合云/多云部署
- 有专职 DevOps/SRE 团队
- 长期投资和规划

**示例场景：**
- 大型互联网公司
- SaaS 平台
- 金融科技应用
- 机器学习平台
- 多租户应用
- 需要符合合规要求的企业应用

### 迁移指南

#### 从 Docker Compose 迁移到 Swarm

非常简单，几乎无需修改：

```bash
# 1. 初始化 Swarm
docker swarm init

# 2. 直接部署 Compose 文件（大部分情况下可以直接使用）
docker stack deploy -c docker-compose.yml myapp

# 3. 可能需要的调整
# - 添加 deploy 配置
# - 使用 Docker Secret 替代环境变量
# - 移除 build 指令（使用构建好的镜像）
```

#### 从 Swarm 迁移到 Kubernetes

需要重新编写配置，但概念相似：

```yaml
# Swarm Service → K8s Deployment + Service

# Swarm (docker-compose.yml)
version: '3.8'
services:
  web:
    image: nginx
    ports:
      - "80:80"
    deploy:
      replicas: 3

# ↓ 转换为 ↓

# Kubernetes (deployment.yaml)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: web
```

**迁移工具：**
- [Kompose](https://kompose.io/): 自动转换 Compose 文件到 K8s 配置
- [Podman](https://podman.io/): 可以同时支持 Swarm 和 K8s

```bash
# 使用 Kompose 转换
kompose convert -f docker-compose.yml
# 生成 K8s YAML 文件

# 部署到 K8s
kubectl apply -f .
```

### 混合方案：Swarm 现在，K8s 将来

如果你现在使用 Swarm，但未来可能迁移到 K8s：

1. **使用标准化工具**
   - Traefik（同时支持 Swarm 和 K8s）
   - Prometheus（监控标准）
   - 标准化日志格式

2. **避免 Swarm 特定功能**
   - 尽量不使用 Swarm 独有的特性
   - 使用云原生设计模式
   - 保持配置简单

3. **容器化最佳实践**
   - 12-Factor App
   - 无状态设计
   - 外部化配置

4. **分阶段迁移**
   ```
   Phase 1: Docker Compose（开发）
   Phase 2: Docker Swarm（生产）
   Phase 3: Kubernetes（大规模生产）
   ```

## 实战经验和避坑指南

### 常见陷阱

#### 1. 忽视资源限制

❌ **错误：**
```yaml
services:
  api:
    image: myapi
    # 没有设置资源限制
```

✅ **正确：**
```yaml
services:
  api:
    image: myapi
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

#### 2. 使用 :latest 标签

❌ **错误：**
```yaml
services:
  web:
    image: nginx:latest  # 不可预测的行为
```

✅ **正确：**
```yaml
services:
  web:
    image: nginx:1.25.3  # 固定版本
```

#### 3. 绑定挂载而非卷

❌ **错误：**
```yaml
volumes:
  - /host/path:/container/path  # 在集群中不可移植
```

✅ **正确：**
```yaml
volumes:
  - data-volume:/container/path
volumes:
  data-volume:
```

#### 4. 缺少健康检查

❌ **错误：**
```yaml
services:
  api:
    image: myapi
    # 没有健康检查
```

✅ **正确：**
```yaml
services:
  api:
    image: myapi
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### 5. 在 Manager 节点运行工作负载

❌ **错误：**
```yaml
# Manager 节点同时运行大量业务容器
```

✅ **正确：**
```yaml
services:
  api:
    deploy:
      placement:
        constraints:
          - node.role==worker  # 只在 Worker 节点运行
```

### 性能优化技巧

#### 1. 使用本地 Registry

```bash
# 部署私有 Registry
docker service create \
  --name registry \
  --publish published=5000,target=5000 \
  --constraint 'node.role==manager' \
  --mount type=volume,source=registry-data,target=/var/lib/registry \
  registry:2

# 标签和推送
docker tag myapp:v1 localhost:5000/myapp:v1
docker push localhost:5000/myapp:v1

# 在服务中使用
docker service create --name app localhost:5000/myapp:v1
```

#### 2. 网络优化

```yaml
# 使用 host 网络模式提升性能（牺牲可移植性）
services:
  high-perf-app:
    image: myapp
    deploy:
      mode: global
      endpoint_mode: dnsrr  # 绕过 VIP，直接 DNS 轮询
    ports:
      - target: 80
        published: 80
        protocol: tcp
        mode: host  # 使用 host 模式
```

#### 3. 日志优化

```yaml
services:
  app:
    image: myapp
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        compress: "true"
```

## 总结

Docker Swarm 提供了一个简单但强大的容器编排解决方案，特别适合中小规模的应用部署。通过本文，你应该掌握了：

1. **核心概念**：节点、服务、任务、网络、配置和密钥
2. **架构原理**：Raft 共识、调度策略、Routing Mesh
3. **实战技能**：部署复杂的微服务应用栈，以及快速上手的简化示例
4. **最佳实践**：安全性、高可用、资源管理、生产环境清单
5. **故障排查**：常见问题诊断和解决
6. **技术选型**：Swarm vs K8s 的详细对比和适用场景

### 关键要点

- **简单性**：Swarm 的最大优势是简单易用，学习成本低
- **生产就绪**：虽然简单，但 Swarm 完全可以用于生产环境
- **适用规模**：对于大多数中小型项目，Swarm 已经足够强大
- **渐进式**：可以从 Compose 起步，逐步过渡到 Swarm，必要时再迁移到 K8s

### 下一步

1. **动手实践**：从快速体验版 Demo 开始
2. **深入学习**：部署完整的微服务应用栈
3. **生产部署**：参考生产环境检查清单
4. **持续优化**：监控、调优、安全加固

记住：**没有最好的技术，只有最适合的技术**。根据团队规模、项目需求和长期规划做出明智的选择。

## 附录

### A. 常用命令速查表

#### 集群管理

```bash
# 初始化 Swarm
docker swarm init --advertise-addr <MANAGER-IP>

# 获取 Worker join token
docker swarm join-token worker

# 获取 Manager join token
docker swarm join-token manager

# 加入 Swarm
docker swarm join --token <TOKEN> <MANAGER-IP>:2377

# 离开 Swarm
docker swarm leave
docker swarm leave --force  # Manager 节点

# 更新 Swarm 配置
docker swarm update --task-history-limit 10
docker swarm update --dispatcher-heartbeat 5s

# 锁定/解锁 Swarm
docker swarm init --autolock=true
docker swarm unlock
docker swarm unlock-key
```

#### 节点管理

```bash
# 列出节点
docker node ls
docker node ls --filter "role=manager"
docker node ls --filter "node.label.env=production"

# 查看节点详情
docker node inspect <NODE>
docker node inspect --pretty <NODE>

# 更新节点
docker node update --availability drain <NODE>
docker node update --availability active <NODE>
docker node update --label-add env=prod <NODE>
docker node update --label-rm env <NODE>

# 提升/降级节点
docker node promote <NODE>
docker node demote <NODE>

# 移除节点
docker node rm <NODE>
docker node rm --force <NODE>
```

#### 服务管理

```bash
# 创建服务
docker service create --name <NAME> <IMAGE>
docker service create --name web --replicas 3 -p 80:80 nginx

# 列出服务
docker service ls
docker service ls --filter "name=web"

# 查看服务详情
docker service inspect <SERVICE>
docker service inspect --pretty <SERVICE>

# 查看服务任务
docker service ps <SERVICE>
docker service ps --filter "desired-state=running" <SERVICE>

# 查看服务日志
docker service logs <SERVICE>
docker service logs -f --tail 100 <SERVICE>

# 更新服务
docker service update --image nginx:alpine <SERVICE>
docker service update --replicas 5 <SERVICE>
docker service update --env-add KEY=VALUE <SERVICE>
docker service update --publish-add 8080:80 <SERVICE>

# 扩缩容
docker service scale <SERVICE>=5
docker service scale web=3 api=5

# 回滚服务
docker service rollback <SERVICE>

# 强制更新（重启所有副本）
docker service update --force <SERVICE>

# 删除服务
docker service rm <SERVICE>
```

#### Stack 管理

```bash
# 部署 Stack
docker stack deploy -c docker-compose.yml <STACK>
docker stack deploy -c app.yml -c override.yml <STACK>

# 列出 Stack
docker stack ls

# 查看 Stack 服务
docker stack services <STACK>

# 查看 Stack 任务
docker stack ps <STACK>

# 删除 Stack
docker stack rm <STACK>
```

#### 网络管理

```bash
# 创建网络
docker network create --driver overlay <NETWORK>
docker network create --driver overlay --opt encrypted <NETWORK>

# 列出网络
docker network ls
docker network ls --filter driver=overlay

# 查看网络详情
docker network inspect <NETWORK>

# 删除网络
docker network rm <NETWORK>

# 清理未使用网络
docker network prune
```

#### 配置和密钥

```bash
# Config
docker config create <NAME> <FILE>
echo "content" | docker config create <NAME> -
docker config ls
docker config inspect <NAME>
docker config rm <NAME>

# Secret
docker secret create <NAME> <FILE>
echo "secret" | docker secret create <NAME> -
docker secret ls
docker secret inspect <NAME>
docker secret rm <NAME>
```

#### 卷管理

```bash
# 列出卷
docker volume ls
docker volume ls --filter "dangling=true"

# 查看卷详情
docker volume inspect <VOLUME>

# 创建卷
docker volume create <VOLUME>

# 删除卷
docker volume rm <VOLUME>

# 清理未使用卷
docker volume prune
```

### B. 实用脚本

#### 1. 集群健康检查脚本

创建 `check-cluster-health.sh`：

```bash
#!/bin/bash

echo "=== Docker Swarm 集群健康检查 ==="
echo ""

# 检查 Swarm 状态
echo "1. Swarm 状态:"
docker info | grep "Swarm:" | awk '{print "   " $0}'
echo ""

# 检查节点状态
echo "2. 节点状态:"
docker node ls --format "table {{.Hostname}}\t{{.Status}}\t{{.Availability}}\t{{.ManagerStatus}}"
echo ""

# 检查不健康的节点
UNHEALTHY=$(docker node ls --filter "node.status!=ready" --format "{{.Hostname}}" | wc -l)
if [ $UNHEALTHY -gt 0 ]; then
    echo "⚠️  警告: 发现 $UNHEALTHY 个不健康节点"
    docker node ls --filter "node.status!=ready"
else
    echo "✅ 所有节点健康"
fi
echo ""

# 检查服务状态
echo "3. 服务状态:"
docker service ls --format "table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}"
echo ""

# 检查失败的服务
FAILED_SERVICES=$(docker service ls --format "{{.Name}} {{.Replicas}}" | awk '$2 !~ /^[0-9]+\/\1$/' | wc -l)
if [ $FAILED_SERVICES -gt 0 ]; then
    echo "⚠️  警告: 发现异常服务"
    docker service ls --format "table {{.Name}}\t{{.Replicas}}" | grep -v "^NAME" | while read name replicas; do
        running=$(echo $replicas | cut -d'/' -f1)
        desired=$(echo $replicas | cut -d'/' -f2)
        if [ "$running" != "$desired" ]; then
            echo "   ⚠️  $name: $replicas"
        fi
    done
else
    echo "✅ 所有服务正常运行"
fi
echo ""

# 检查系统资源
echo "4. 节点资源使用:"
docker node ls --format "{{.Hostname}}" | while read node; do
    echo "   $node:"
    docker node inspect $node --format '      CPU: {{.Description.Resources.NanoCPUs}}, Memory: {{.Description.Resources.MemoryBytes}}'
done
echo ""

# 检查网络
echo "5. Overlay 网络:"
docker network ls --filter "driver=overlay" --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}"
echo ""

echo "=== 健康检查完成 ==="
```

#### 2. 服务滚动更新脚本

创建 `rolling-update.sh`：

```bash
#!/bin/bash

SERVICE=$1
IMAGE=$2
PARALLELISM=${3:-1}
DELAY=${4:-10s}

if [ -z "$SERVICE" ] || [ -z "$IMAGE" ]; then
    echo "用法: $0 <service-name> <new-image> [parallelism] [delay]"
    echo "示例: $0 web nginx:alpine 2 15s"
    exit 1
fi

echo "=== 开始滚动更新 ==="
echo "服务: $SERVICE"
echo "镜像: $IMAGE"
echo "并行度: $PARALLELISM"
echo "延迟: $DELAY"
echo ""

# 记录当前状态
echo "更新前状态:"
docker service ps $SERVICE --filter "desired-state=running"
echo ""

# 执行更新
echo "执行更新..."
docker service update \
    --image $IMAGE \
    --update-parallelism $PARALLELISM \
    --update-delay $DELAY \
    --update-failure-action rollback \
    --update-monitor 30s \
    $SERVICE

# 等待更新完成
echo ""
echo "等待更新完成..."
sleep 5

# 检查更新状态
while true; do
    STATUS=$(docker service inspect $SERVICE --format '{{.UpdateStatus.State}}')

    if [ "$STATUS" == "completed" ]; then
        echo "✅ 更新成功完成"
        break
    elif [ "$STATUS" == "rollback_completed" ]; then
        echo "❌ 更新失败，已自动回滚"
        exit 1
    elif [ "$STATUS" == "updating" ] || [ "$STATUS" == "paused" ]; then
        echo "⏳ 更新中... ($STATUS)"
        sleep 5
    else
        echo "状态: $STATUS"
        sleep 5
    fi
done

echo ""
echo "更新后状态:"
docker service ps $SERVICE --filter "desired-state=running"
```

#### 3. 备份脚本

创建 `backup-swarm.sh`：

```bash
#!/bin/bash

BACKUP_DIR=${1:-/backup/swarm}
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/swarm-backup-$DATE"

echo "=== Docker Swarm 备份 ==="
echo "备份目录: $BACKUP_PATH"
echo ""

# 创建备份目录
mkdir -p $BACKUP_PATH

# 1. 备份 Swarm 配置
echo "1. 备份 Swarm 配置..."
if docker info | grep -q "Swarm: active"; then
    echo "   停止 Docker..."
    systemctl stop docker

    echo "   备份 Swarm 数据..."
    tar czf $BACKUP_PATH/swarm-state.tar.gz -C /var/lib/docker swarm

    echo "   启动 Docker..."
    systemctl start docker
    echo "   ✅ Swarm 配置备份完成"
else
    echo "   ⚠️  Swarm 未激活，跳过"
fi
echo ""

# 2. 导出服务配置
echo "2. 导出服务配置..."
mkdir -p $BACKUP_PATH/services
docker service ls --format "{{.Name}}" | while read service; do
    echo "   导出 $service..."
    docker service inspect $service > $BACKUP_PATH/services/$service.json
done
echo "   ✅ 服务配置导出完成"
echo ""

# 3. 导出网络配置
echo "3. 导出网络配置..."
mkdir -p $BACKUP_PATH/networks
docker network ls --filter "driver=overlay" --format "{{.Name}}" | while read network; do
    if [ "$network" != "ingress" ]; then
        echo "   导出 $network..."
        docker network inspect $network > $BACKUP_PATH/networks/$network.json
    fi
done
echo "   ✅ 网络配置导出完成"
echo ""

# 4. 列出 Config 和 Secret
echo "4. 列出 Config 和 Secret..."
docker config ls > $BACKUP_PATH/configs-list.txt
docker secret ls > $BACKUP_PATH/secrets-list.txt
echo "   ⚠️  注意: Secret 内容无法直接导出，请手动备份"
echo ""

# 5. 备份卷数据（可选）
echo "5. 列出数据卷..."
docker volume ls > $BACKUP_PATH/volumes-list.txt
echo "   提示: 使用单独的脚本备份卷数据"
echo ""

# 压缩备份
echo "6. 压缩备份..."
cd $BACKUP_DIR
tar czf swarm-backup-$DATE.tar.gz swarm-backup-$DATE
rm -rf swarm-backup-$DATE
echo "   ✅ 备份完成: $BACKUP_DIR/swarm-backup-$DATE.tar.gz"
echo ""

# 清理旧备份（保留最近7天）
echo "7. 清理旧备份（保留7天）..."
find $BACKUP_DIR -name "swarm-backup-*.tar.gz" -mtime +7 -delete
echo "   ✅ 清理完成"
echo ""

echo "=== 备份完成 ==="
```

#### 4. 监控脚本

创建 `monitor-services.sh`：

```bash
#!/bin/bash

# 服务监控脚本

while true; do
    clear
    echo "=== Docker Swarm 服务监控 ==="
    echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # 节点状态
    echo "节点状态:"
    docker node ls
    echo ""

    # 服务状态
    echo "服务状态:"
    docker service ls
    echo ""

    # 检查异常服务
    echo "异常服务:"
    docker service ls --format "{{.Name}} {{.Replicas}}" | while read name replicas; do
        running=$(echo $replicas | cut -d'/' -f1)
        desired=$(echo $replicas | cut -d'/' -f2)
        if [ "$running" != "$desired" ]; then
            echo "⚠️  $name: $replicas"
            docker service ps $name --filter "desired-state=running" --no-trunc
        fi
    done
    echo ""

    echo "按 Ctrl+C 退出监控"
    sleep 10
done
```

### C. 性能基准测试

#### 网络性能测试

```bash
# 1. 创建测试服务
docker service create --name iperf-server \
    --network testnet \
    --replicas 1 \
    networkstatic/iperf3 -s

docker service create --name iperf-client \
    --network testnet \
    networkstatic/iperf3 -c iperf-server -t 30

# 2. 查看测试结果
docker service logs iperf-client
```

#### 存储性能测试

```bash
# 使用 fio 测试卷性能
docker service create --name fio-test \
    --mount type=volume,source=test-vol,target=/data \
    ljishen/fio \
    fio --name=random-write --ioengine=libaio --iodepth=16 \
    --rw=randwrite --bs=4k --direct=1 --size=1G \
    --numjobs=4 --runtime=60 --group_reporting \
    --filename=/data/test
```

## 参考资源

### 官方文档
- [Docker Swarm 官方文档](https://docs.docker.com/engine/swarm/)
- [Docker Compose 文件参考](https://docs.docker.com/compose/compose-file/)
- [Docker Engine API](https://docs.docker.com/engine/api/)

### 技术文章
- [Raft Consensus Algorithm](https://raft.github.io/)
- [Container Networking](https://docs.docker.com/network/)
- [Docker Security](https://docs.docker.com/engine/security/)

### 工具和资源
- [Portainer](https://www.portainer.io/) - Web UI 管理界面
- [Swarmpit](https://swarmpit.io/) - 轻量级 Swarm 管理工具
- [Traefik](https://traefik.io/) - 现代化反向代理
- [Awesome Docker](https://github.com/veggiemonk/awesome-docker) - Docker 资源合集

### 社区
- [Docker Forums](https://forums.docker.com/)
- [Docker Community Slack](https://www.docker.com/community/)
- [Stack Overflow - Docker Swarm](https://stackoverflow.com/questions/tagged/docker-swarm)