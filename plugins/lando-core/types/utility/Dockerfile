# docker build -t devwithlando/util:4 .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    bzip2 \
    curl \
    git-core \
    jq \
    rsync \
    ssh \
    wget \
    unzip \
  && apt-get -y clean \
  && apt-get -y autoclean \
  && apt-get -y autoremove \
  && rm -rf /var/lib/apt/lists/* && rm -rf && rm -rf /var/lib/cache/* && rm -rf /var/lib/log/* && rm -rf /tmp/*
