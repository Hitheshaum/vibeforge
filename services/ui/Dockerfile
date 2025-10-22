FROM node:20-alpine

WORKDIR /app

# Copy shared package first
COPY packages/shared ./packages/shared/
RUN cd packages/shared && npm install && npm run build

# Copy package files
COPY services/ui/package*.json ./

# Install dependencies (this will link to packages/shared)
RUN npm install

# Copy source code
COPY services/ui .

EXPOSE 3000

CMD ["npm", "run", "dev"]
