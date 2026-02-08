FROM docker.xuanyuan.me/library/node:20-alpine

WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建项目
RUN pnpm run build

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["pnpm", "run", "start"]