#!/bin/bash

gcloud run deploy crbot \
  --source . \
  --port 3000 \
  --allow-unauthenticated \
  --env-vars-file=env.yaml