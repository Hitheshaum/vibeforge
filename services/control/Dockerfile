FROM node:20-alpine

# Install AWS CLI v2 and CDK dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    bash \
    curl \
    unzip \
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Install global npm packages
RUN npm install -g aws-cdk@latest typescript ts-node

WORKDIR /app

# Copy shared package first
COPY packages/shared ./packages/shared/
RUN cd packages/shared && npm install && npm run build

# Copy package files
COPY services/control/package*.json ./

# Install dependencies (this will link to packages/shared)
RUN npm install

# Copy source code
COPY services/control .

# Create work and data directories
RUN mkdir -p /work /data

EXPOSE 4000

CMD ["npm", "run", "dev"]
