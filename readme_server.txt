# 🚀 Supermind PM2 Server & Tunnel Management Quickstart

Follow these commands to start, stop, and monitor the backend server and ngrok tunnel in the background.

---

## 🏁 Starting the Services

### 1. Start the Backend Server
Run this from the project root (`d:\supermind`):
```bash
pm2 start backend/server.js --name "supermind-backend"
```

### 2. Start the Ngrok Tunnel
Run this from the project root (`d:\supermind`) to launch the tunnel invisibly using the custom script and interpreter:
```bash
pm2 start start-ngrok.bat --name "supermind-tunnel" --interpreter cmd
```

### 3. Configure the URL in Frontend
run this command in terminal: ngrok http --url=https://component-zipfile-cause.ngrok-free.dev 3001

---

## 🛠️ Managing and Monitoring (Daily Use)

* **Check Status:** See what is running:
  ```bash
  pm2 status
  ```

* **View Logs (Real-time):**
  * Backend logs:
    ```bash
    pm2 logs supermind-backend
    ```
  * Ngrok logs (to check traffic/mobile requests):
    ```bash
    pm2 logs supermind-tunnel
    ```

* **Restarting (e.g. after changing .env configurations):**
  ```bash
  pm2 restart supermind-backend
  ```

* **Stopping the Services:**
  ```bash
  pm2 stop all
  # Or individually:
  pm2 stop supermind-backend
  pm2 stop supermind-tunnel
  ```

* **Deleting from PM2 list:**
  ```bash
  pm2 delete all
  ```

---

## 💾 Persisting Across System Reboots (Windows Setup)
If you want these processes to start automatically when your laptop boots up:
1. Run `pm2 save` once they are both running.
2. If you haven't set up the startup service yet, run:
   ```bash
   npm install -g pm2-windows-startup
   pm2-startup install
   pm2 save
   ```
