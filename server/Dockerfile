FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (need devDeps for TypeScript build)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Railway sets PORT env var, typically 8080)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
