.PHONY: install test smoke toolbox

install:
	npm install

test:
	npm test

smoke:
	npm run racer -- solve examples/hello-flag

toolbox:
	docker build -t ctf-racer-toolbox:dev toolbox
