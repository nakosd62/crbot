#!/bin/bash
pkill -9 -f "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python app.py"
pkill -9 -f "ngrok http 3000"