# Runs when make reads this file (Make database mode only)
VERSION := $(shell echo 1.0)

.PHONY: build test clean lint

include extra.mk

build: app.o
	@echo 'make: build (⌘B)'

app.o: app.c
	@echo 'make: app.o is a file target - should NOT appear'

%.o: %.c
	@echo 'pattern rule - should NOT appear'

test:
	@echo 'make: test'

clean:
	@echo 'make: clean (⇧⌘K)'

docs/site:
	@echo 'file target - should NOT appear'

_internal:
	@echo 'not .PHONY - should NOT appear'
