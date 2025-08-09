#!/bin/bash

# Create a test settings file
cat > test-settings.json << 'EOF'
{
  "lines": [
    [
      {
        "id": "1",
        "type": "custom-command",
        "commandPath": "echo test",
        "color": "yellow"
      },
      {
        "id": "2",
        "type": "custom-text",
        "customText": "Hello World"
      }
    ]
  ],
  "colors": {
    "model": "cyan",
    "gitBranch": "magenta",
    "separator": "dim"
  }
}
EOF

# Create test directory and copy settings
mkdir -p ~/.config/ccstatusline
cp test-settings.json ~/.config/ccstatusline/settings.json

echo "Starting TUI with test settings..."
echo "Try editing a custom command or custom text item to test the cursor movement"
echo "Press Ctrl+C to exit"

# Run the TUI
timeout 2 bun run src/ccstatusline.ts 2>/dev/null || true

# Clean up
rm test-settings.json
echo ""
echo "Test completed"