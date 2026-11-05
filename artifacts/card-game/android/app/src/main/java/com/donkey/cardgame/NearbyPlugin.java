package com.donkey.cardgame;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

// Local-network transport only. The host's JS rules validate every game command.
@CapacitorPlugin(name = "Nearby")
public class NearbyPlugin extends Plugin {
    private final Map<String, Socket> sockets = new ConcurrentHashMap<>();
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private volatile ServerSocket server;
    private volatile long generation = 0;

    private void event(String type, String peer, String data) {
        JSObject payload = new JSObject();
        payload.put("type", type); payload.put("peer", peer); payload.put("data", data);
        notifyListeners("packet", payload);
    }
    private synchronized void stopAll() {
        generation++;
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        server = null;
        for (Socket socket : sockets.values()) try { socket.close(); } catch (IOException ignored) {}
        sockets.clear();
    }
    private void read(Socket socket, String peer, long session) {
        workers.execute(() -> {
            try {
                socket.setTcpNoDelay(true);
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder line = new StringBuilder();
                int value;
                while ((value = reader.read()) != -1 && session == generation) {
                    if (value == '\n') {
                        event("message", peer, line.toString()); line.setLength(0);
                    } else {
                        if (line.length() >= 65536) throw new IOException("Packet too large");
                        line.append((char) value);
                    }
                }
            } catch (IOException ignored) {
            } finally {
                sockets.remove(peer, socket);
                try { socket.close(); } catch (IOException ignored) {}
                if (session == generation) event("closed", peer, "Connection closed. Rejoin the nearby room.");
            }
        });
    }
    @PluginMethod public void host(PluginCall call) {
        workers.execute(() -> {
            stopAll();
            long session = generation;
            try {
                ServerSocket listener = new ServerSocket();
                listener.setReuseAddress(true);
                listener.bind(new InetSocketAddress("0.0.0.0", 47831));
                server = listener;
                JSObject result = new JSObject();
                ArrayList<String> addresses = new ArrayList<>();
                for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    for (InetAddress address : Collections.list(network.getInetAddresses())) {
                        if (address instanceof Inet4Address && address.isSiteLocalAddress() && !address.isLoopbackAddress()) addresses.add(address.getHostAddress());
                    }
                }
                result.put("addresses", new org.json.JSONArray(addresses));
                call.resolve(result);
                while (session == generation && !listener.isClosed()) {
                    Socket socket = listener.accept();
                    if (!socket.getInetAddress().isSiteLocalAddress()) { socket.close(); continue; }
                    if (sockets.size() >= 9) { socket.close(); continue; }
                    String peer = UUID.randomUUID().toString();
                    sockets.put(peer, socket);
                    read(socket, peer, session);
                }
            } catch (IOException error) {
                if (session == generation) { stopAll(); call.reject("Cannot host here. Enable Wi-Fi or hotspot and retry."); }
            }
        });
    }
    @PluginMethod public void join(PluginCall call) {
        String host = call.getString("address", "");
        if (!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) { call.reject("Enter the host phone's IPv4 address."); return; }
        workers.execute(() -> {
            stopAll();
            long session = generation;
            try {
                InetAddress address = InetAddress.getByName(host);
                if (!address.isSiteLocalAddress()) throw new IOException("Not a local address");
                Socket socket = new Socket();
                sockets.put("host", socket);
                socket.connect(new InetSocketAddress(address, 47831), 8000);
                if (session != generation) { socket.close(); return; }
                read(socket, "host", session);
                call.resolve();
            } catch (IOException error) {
                stopAll(); call.reject("Cannot reach the host. Check the Wi-Fi/hotspot and host address.");
            }
        });
    }
    @PluginMethod public void send(PluginCall call) {
        String peer = call.getString("peer", "host");
        String data = call.getString("data", "");
        if (data.length() > 65536 || data.contains("\n")) { call.reject("Invalid packet"); return; }
        Socket socket = sockets.get(peer);
        if (socket == null) { call.reject("Player disconnected"); return; }
        writer.execute(() -> {
            try {
                synchronized (socket) {
                    socket.getOutputStream().write((data + "\n").getBytes(StandardCharsets.UTF_8));
                    socket.getOutputStream().flush();
                }
                call.resolve();
            } catch (IOException error) { call.reject("Connection interrupted"); }
        });
    }
    @PluginMethod public void stop(PluginCall call) { stopAll(); call.resolve(); }
    @Override protected void handleOnDestroy() { stopAll(); workers.shutdownNow(); writer.shutdownNow(); }
}
