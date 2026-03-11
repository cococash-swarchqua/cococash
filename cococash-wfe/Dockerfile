# Use Node.js for development
FROM node:20-alpine

WORKDIR /app

# Install dependencies separately for caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Vite default port
EXPOSE 5173

# Run dev server
CMD ["npm", "run", "dev", "--", "--host"]
