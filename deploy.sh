#!/bin/bash
set -e

echo "🚀 AIRI Docker 部署脚本"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 拉取最新镜像
echo -e "${YELLOW}📥 拉取最新 Docker 镜像...${NC}"
docker pull ghcr.io/yukiovob/airi/server:latest
docker pull ghcr.io/yukiovob/airi/web:latest

# 停止并删除旧容器
echo -e "${YELLOW}🛑 停止旧容器...${NC}"
docker-compose down

# 启动新容器
echo -e "${YELLOW}🚀 启动新容器...${NC}"
docker-compose up -d

# 清理未使用的镜像
echo -e "${YELLOW}🧹 清理未使用的镜像...${NC}"
docker image prune -f

echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${GREEN}🌐 Web: http://localhost${NC}"
echo -e "${GREEN}🔧 Server: http://localhost:3000${NC}"
