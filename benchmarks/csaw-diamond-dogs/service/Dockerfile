FROM ubuntu:20.04
RUN apt-get update && apt-get install -y --no-install-recommends socat && rm -rf /var/lib/apt/lists/* && useradd -m ctf
WORKDIR /home/ctf
COPY guard-dog libc-2.31.so ld-2.31.so ./
RUN chmod +x ./guard-dog ./ld-2.31.so && chown -R root:root /home/ctf
USER ctf
EXPOSE 1025
CMD ["socat", "-T60", "TCP-LISTEN:1025,reuseaddr,fork", "EXEC:./guard-dog,stderr"]
