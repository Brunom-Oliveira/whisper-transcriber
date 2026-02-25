FROM debian:bookworm-slim AS whisper-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
WORKDIR /tmp/whisper.cpp
RUN cmake -B build -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON . \
 && cmake --build build -j"$(nproc)"

FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/whisper/bin /opt/whisper/lib /opt/whisper/models
COPY --from=whisper-build /tmp/whisper.cpp/build/bin/whisper-cli /opt/whisper/bin/whisper-cli
COPY --from=whisper-build /tmp/whisper.cpp/build/src/libwhisper.so* /opt/whisper/lib/
COPY --from=whisper-build /tmp/whisper.cpp/build/ggml/src/libggml*.so* /opt/whisper/lib/
ENV LD_LIBRARY_PATH=/opt/whisper/lib

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN mkdir -p uploads outputs

EXPOSE 3001
CMD ["npm", "run", "start"]
