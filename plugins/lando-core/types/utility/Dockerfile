# docker build -t ghcr.io/automattic/vip-container-images/lando-util:4 .

FROM debian:bookworm-slim
RUN apt-get update && \
  apt-get install -y --no-install-recommends bzip2 curl git-core jq openssl rsync ssh wget unzip \
  && apt-get -y clean \
  && apt-get -y autoclean \
  && apt-get -y autoremove \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/*
