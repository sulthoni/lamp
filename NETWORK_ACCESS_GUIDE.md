# Local Network Access Guide

This guide explains how to access your LAMP application from other devices on your local network.

## Configuration Summary

The application has been configured to allow network access:

### Backend (Flask) ✅

- **Host**: `0.0.0.0` (listens on all network interfaces)
- **Port**: `5000`
- File: `backend/app.py`

### Frontend (Angular) ✅

- **Host**: `0.0.0.0` (listens on all network interfaces)
- **Port**: `4200`
- File: `frontend/angular.json`

## Your Machine's IP Address

Your current local IP address is: **`192.168.18.198`**

> **Note**: This IP address may change if you reconnect to the network or restart your router. To find your current IP at any time, run:
>
> ```bash
> ipconfig getifaddr en0    # For Wi-Fi
> ipconfig getifaddr en1    # For Ethernet
> ```

## How to Access from Other Devices

### Option 1: Localhost (Same Machine Only)

- Frontend: `http://localhost:4200`
- Backend API: `http://localhost:5000/api`

### Option 2: Network Access (From Any Device on Local Network)

- Frontend: `http://192.168.18.198:4200`
- Backend API: `http://192.168.18.198:5000/api`

## Important: Update Environment Files for Network Access

When accessing from **other devices** on the network, you need to update the Angular environment files to use your machine's IP address instead of localhost:

### For Development:

Edit `frontend/src/environments/environment.development.ts`:

```typescript
export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
    backendAdminUrl: "http://192.168.18.198:5000/api", // Your IP here
    backendGraphDBUrl: "http://192.168.18.198:7200", // Your IP here
  },
};
```

### For Production:

Edit `frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} PROD`,
    backendAdminUrl: "http://192.168.18.198:5000/api", // Your IP here
    backendGraphDBUrl: "http://192.168.18.198:7200", // Your IP here
  },
};
```

> **Note**: After changing these files, restart the Angular dev server for changes to take effect.

## Starting the Application

### Option 1: Start Both Services Together

```bash
# From the root directory
cd /Volumes/Sulthonis\ SSD/Projects/Learn/lamp
# Use VS Code task: "Start Full Stack"
```

### Option 2: Start Services Separately

**Start Backend:**

```bash
cd backend
source venv/bin/activate  # If using virtual environment
python app.py
```

**Start Frontend:**

```bash
cd frontend
ng serve
# Or use: npm start
```

## Firewall Configuration

If you can't access the app from other devices, check your firewall settings:

### macOS:

1. Go to **System Preferences** → **Security & Privacy** → **Firewall**
2. Click **Firewall Options**
3. Ensure Python and Node are allowed to accept incoming connections
4. Or temporarily disable the firewall for testing

Alternatively, allow specific ports:

```bash
# Allow Flask backend (port 5000)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/bin/python3
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/bin/python3

# Allow Angular dev server (port 4200)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
```

## Testing Network Access

### From the Same Machine:

```bash
# Test backend
curl http://localhost:5000/api/connections

# Test frontend
open http://localhost:4200
```

### From Another Device on the Network:

1. Make sure both devices are connected to the **same Wi-Fi network**
2. Open a browser on the other device
3. Navigate to: `http://192.168.18.198:4200`

### Troubleshooting:

```bash
# Check if Flask is listening on all interfaces
lsof -i :5000

# Check if Angular dev server is listening
lsof -i :4200

# Ping your machine from another device
ping 192.168.18.198
```

## CORS Configuration

The Flask backend already has CORS enabled for all origins:

```python
CORS(app, origins="*")
```

This allows requests from any origin. For production, you should restrict this to specific origins:

```python
CORS(app, origins=["http://192.168.18.198:4200"])
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Development Only**: This configuration is suitable for development and local network access only
2. **Firewall**: Keep your firewall enabled and only allow necessary applications
3. **CORS**: For production, restrict CORS to specific origins
4. **HTTPS**: For production deployment, use HTTPS instead of HTTP
5. **Network Trust**: Only use this on trusted networks (home/office Wi-Fi)

## Quick Reference

| Service          | Port | Localhost                 | Network Access                 |
| ---------------- | ---- | ------------------------- | ------------------------------ |
| Angular Frontend | 4200 | http://localhost:4200     | http://192.168.18.198:4200     |
| Flask Backend    | 5000 | http://localhost:5000     | http://192.168.18.198:5000     |
| Backend API      | 5000 | http://localhost:5000/api | http://192.168.18.198:5000/api |

---

## Need to Find Your IP Again?

Run this command:

```bash
ipconfig getifaddr en0  # Wi-Fi
ipconfig getifaddr en1  # Ethernet
```

Or check all network interfaces:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```
