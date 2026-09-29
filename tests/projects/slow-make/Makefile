# Listing this Makefile hangs in "Asking make" mode: make evaluates $(shell …) while listing.
# Automatic Tasks should stop it after 15 seconds and show "make took too long" with Refresh.
SLOW := $(shell sleep 60)

.PHONY: build

build:
	@echo 'slow-make: build'
