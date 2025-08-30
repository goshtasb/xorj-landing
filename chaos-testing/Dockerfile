FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    postgresql-client \
    python3 \
    py3-pip \
    bash

# Install toxiproxy CLI
RUN wget -O toxiproxy-2.5.0.tar.gz https://github.com/Shopify/toxiproxy/releases/download/v2.5.0/toxiproxy-linux-amd64 && \
    tar -xzf toxiproxy-2.5.0.tar.gz && \
    mv toxiproxy-linux-amd64 /usr/local/bin/toxiproxy-cli && \
    chmod +x /usr/local/bin/toxiproxy-cli && \
    rm toxiproxy-2.5.0.tar.gz

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create results directory
RUN mkdir -p /app/results

# Expose port
EXPOSE 9000

# Start the chaos controller
CMD ["npm", "start"]