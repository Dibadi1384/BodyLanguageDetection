#!/bin/bash

echo "Installing Video Upload Application..."
echo

echo "Installing Backend dependencies..."
cd Backend
npm install
if [ $? -ne 0 ]; then
    echo "Backend installation failed!"
    exit 1
fi
cd ..

echo
echo "Installing Frontend dependencies..."
cd Frontend
npm install
if [ $? -ne 0 ]; then
    echo "Frontend installation failed!"
    exit 1
fi
cd ..

echo
echo "Installation completed successfully!"
echo
echo "To start the application:"
echo "1. Open two terminal windows"
echo "2. In first terminal: cd Backend && npm start"
echo "3. In second terminal: cd Frontend && npm start"
echo "4. Open http://localhost:3000 in your browser"
echo

