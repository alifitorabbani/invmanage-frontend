#!/bin/bash

# Get the current branch
CURRENT_BRANCH=$(git branch --show-current)

# Add all changes
git add .

# Commit with a message
git commit -m "Auto push from script"

# Push to the current branch
git push origin $CURRENT_BRANCH

echo "Changes pushed to GitHub on branch $CURRENT_BRANCH"