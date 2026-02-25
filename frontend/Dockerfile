FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install ajv@8.17.1 ajv-keywords@5.1.0 --legacy-peer-deps

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ARG REACT_APP_API_URL=http://localhost:4001
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/build ./build
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
