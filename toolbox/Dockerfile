FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    git curl wget file binutils gdb \
    netcat-openbsd socat jq ripgrep \
    binwalk exiftool foremost steghide \
    tshark nmap \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
CMD ["bash"]
