FROM ubuntu:22.04

RUN apt-get update -qq \
    && apt-get install -y -qq \
        curl \
        sudo \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash docker \
    && echo 'docker ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/docker

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y -qq nodejs \
    && rm -rf /var/lib/apt/lists/*

USER docker
WORKDIR /home/docker

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

ENV PATH="/home/docker/.cargo/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"

WORKDIR /action