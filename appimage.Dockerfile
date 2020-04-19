FROM node:8

RUN mkdir /tmp/build
WORKDIR /tmp/build

COPY package.json .
COPY yarn.lock .
RUN yarn install

COPY . .
RUN yarn run build
RUN yarn run dist-l
