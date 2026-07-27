#!/bin/bash

export CRBOT_HOSTNAME="0.0.0.0"
export CRBOT_PORT="3000"

echo "stopping any previous runs..."
./kill_app.sh
sleep 1

echo "starting server..."
nohup ./venv/bin/python3 app.py > app.log 2>&1 &

echo "starting ngrok..."
nohup ngrok http $CRBOT_PORT > ngrok.log 2>&1 &

echo "monitoring standard output / error..."
tail -f app.log ngrok.log

 