#!/bin/bash -e

mkdir -m 777 -p dist

docker build -f appimage.Dockerfile -t falcon_appimage_build .
docker run --rm -it -v $PWD/dist:/tmp/dist falcon_appimage_build \
  bash -c 'cp -r release/*.AppImage /tmp/dist/'
