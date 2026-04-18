# Backend + Frontend Deploy (Ubuntu VPS / Yandex Cloud)

## 1) Install runtime
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx build-essential
sudo npm i -g pm2
```

## 2) Project setup
```bash
sudo mkdir -p /var/www/sadvrfqtvw4-main
sudo chown -R $USER:$USER /var/www/sadvrfqtvw4-main
cd /var/www/sadvrfqtvw4-main
npm ci
mkdir -p uploads
```

## 3) Environment
```bash
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://example.com
JWT_SECRET=change-this-secret
ENCRYPTION_KEY=change-this-message-key
DB_PATH=/var/www/sadvrfqtvw4-main/database.sqlite
UPLOADS_DIR=/var/www/sadvrfqtvw4-main/uploads
MAX_UPLOAD_SIZE_MB=2048
EOF
```

## 4) Build
```bash
npm run build
npm run build:backend
```

## 5) Run backend with PM2
```bash
pm2 start ecosystem.config.js --env production
pm2 status
pm2 logs sadvrfqtvw4-backend --lines 100
```

## 6) Enable PM2 autostart
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

## 7) Nginx reverse proxy
```bash
sudo cp deploy/nginx/sadvrfqtvw4.conf /etc/nginx/sites-available/sadvrfqtvw4.conf
sudo ln -sf /etc/nginx/sites-available/sadvrfqtvw4.conf /etc/nginx/sites-enabled/sadvrfqtvw4.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## 8) Verify
```bash
curl -i http://127.0.0.1:3000/api/status
curl -i http://127.0.0.1:3000/api/me
curl -i http://127.0.0.1:3000/api/users/search?query=test
curl -i http://example.com/api/status
```

## 9) Update flow
```bash
cd /var/www/sadvrfqtvw4-main
npm ci
npm run build
npm run build:backend
pm2 restart sadvrfqtvw4-backend --update-env
```

## 10) HTTPS for voice calls (required outside localhost)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
sudo nginx -t
sudo systemctl reload nginx
```

## Localhost run
```bash
npm run build:backend
node dist-server/server.js
npm run dev:frontend -- --host 127.0.0.1 --port 5173
```
