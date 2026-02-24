FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

ARG REACT_APP_API_URL=http://localhost:3001
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/build ./build
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
