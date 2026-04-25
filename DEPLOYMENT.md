# AIRI Docker 部署指南

## 自动 CI/CD

每次 `push` 到 `main` 分支时，GitHub Actions 会自动：
1. 构建前后端 Docker 镜像
2. 推送到 GitHub Container Registry (ghcr.io)
3. 在服务器上自动执行 `docker compose pull && docker compose up -d --remove-orphans`

镜像地址：
- 后端: `ghcr.io/yukiovob/airi/server:latest`
- 前端: `ghcr.io/yukiovob/airi/web:latest`

### 需要配置的 GitHub Secrets

在仓库的 Settings -> Secrets and variables -> Actions 中添加：

- `SERVER_HOST`：服务器公网 IP 或域名
- `SERVER_USER`：SSH 用户，通常是 `root`
- `SERVER_PASSWORD`：SSH 登录密码
- `SERVER_PATH`：项目目录，默认 `/root/airi`

如果你的 GHCR 镜像是私有的，再额外配置：

- `GHCR_USERNAME`
- `GHCR_TOKEN`

## 服务器部署

### 1. 安装 Docker 和 Docker Compose

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 docker-compose (如果没有)
sudo apt install docker-compose-plugin
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.server.example .env.server

# 编辑并填入实际值
nano .env.server
```

### 3. 启动服务

```bash
# 方式一：使用部署脚本
chmod +x deploy.sh
./deploy.sh

# 方式二：直接使用 docker-compose
docker compose up -d
```

### 4. 查看日志

```bash
# 查看所有日志
docker compose logs -f

# 只看 server
docker compose logs -f airi-server

# 只看 web
docker compose logs -f airi-web
```

### 5. 更新部署

每次有新代码 push 后，在服务器运行：

```bash
./deploy.sh
```

如果 GitHub Actions 已经配置好服务器密钥，push 到 `main` 后会自动执行这一步，不需要手动登录服务器。

## 端口说明

| 服务 | 容器端口 | 宿主机端口 |
|------|----------|------------|
| Web  | 80       | 80         |
| Server | 3000    | 3000       |

## 使用域名和 HTTPS

推荐使用 Nginx 或 Caddy 作为反向代理：

### Caddy 示例 (自动 HTTPS)

```
your-domain.com {
    reverse_proxy localhost:80
}

api.your-domain.com {
    reverse_proxy localhost:3000
}
```

### Nginx 示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:80;
    }
}
```

## 故障排查

```bash
# 查看容器状态
docker compose ps

# 进入容器调试
docker compose exec airi-server sh
docker compose exec airi-web sh

# 重启服务
docker compose restart
```
