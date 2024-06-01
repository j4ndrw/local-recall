# Local Recall

## Credit

This project is an adaptation of [https://github.com/AbdBarho/ReRecall](ReRecall by AbdBarho).
Kudos to them for starting this project.

## Description

This is a toy project and not meant for regular usage. I just wanted to see how
Microsoft's Recall agent could be implemented.
Because of this, I took a bunch of shortcuts to get this done.

Also, I'm using small models for inference, since I own an old gaming laptop
that I'm running inference on. Because of this, results are pretty poor.

## Prerequisites

- `node >= 18.x.x`
- `pnpm`
- `docker` and `docker-compose`
- `ollama`

## Tech stack

- `Node.js` - I chose it because I wanted to build a prototype very quickly
- `Ollama` - local LLMs and LMMs (as of this writing, only LLaVa variations are available)
- `Chroma DB` - vector DB used for RAG - here we're storing the descriptions of
the streamed screenshots, so that we can feed them to an LLM that is being asked
a questions by the user.
- `Apache Kafka` - event store and store processing platform - I'm using this because
of its ability to pause and resume message consuming. Running LMM inference on
screenshots is computationally expensive, so we don't want to spam the LMM with images.
As such, whenever the LMM is busy with describing an image, the consumer pauses.
Concurrently, the producer keeps streaming screenshots to the consumer - they will be
processed when the LMM has the capacity to process them

## Usage

The way this project was architected was in a library format, so, in theory,
you could use it and build a bespoke UI. However, there's a lot of stuff coupled
together, so there's no room for building custom UIs.

```console
$ git clone https://github.com/j4ndrw/local-recall
$ cd local-recall

$ pnpm i

# Open 2 terminal windows
$ pnpm run infrastructure:start # On 1st terminal
$ pnpm run playground:record # On 2nd terminal

# Whenever you want to query, edit the `packages/playground/src/query.ts` script
# so that it uses your query.
$ pnpm run playground:query
```
