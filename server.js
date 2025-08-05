const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

const clients = {};
const channels = {};
const groupChannels = {};

wss.on("connection", (ws) => {
  console.log("New WebSocket connection");
  
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Raw message received:", data);
      
      const { type, userId, senderId, channelId, content, groupId, groupMembers } = data;
      const actualUserId = senderId || userId;

      console.log("Parsed message:", { type, actualUserId, channelId, groupId, groupMembers });

      if (type === "init") {
        clients[actualUserId] = ws;
        console.log(`User ${actualUserId} connected. Total clients: ${Object.keys(clients).length}`);
        return;
      }

      if (type === "message") {
        // Handle direct messages between two users
        if (!channels[channelId]) {
          channels[channelId] = [];
        }
        
        const chatMessage = { 
          userId: actualUserId, 
          content, 
          timestamp: Date.now() 
        };
        channels[channelId].push(chatMessage);

        // Extract user IDs from channelId (format: userId1_userId2)
        const userIds = channelId.split('_');
        
        // Send to both users in the direct conversation
        userIds.forEach(targetUserId => {
          const targetClient = clients[targetUserId];
          if (targetClient && targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(JSON.stringify({ 
              type: "message", 
              channelId, 
              chatMessage 
            }));
          }
        });

        console.log(`Direct message sent in channel ${channelId} to users: ${userIds.join(', ')}`);
        return;
      }

      if (type === "group_message") {
        // Handle group chat messages
        if (!groupChannels[groupId]) {
          groupChannels[groupId] = [];
        }

        const chatMessage = {
          senderId: actualUserId,
          content,
          timestamp: Date.now(),
          isFile: data.isFile || false,
          fileType: data.fileType,
          fileName: data.fileName
        };
        
        groupChannels[groupId].push(chatMessage);

        // Send to all group members (including sender for confirmation)
        const allGroupMembers = [...(groupMembers || []), actualUserId]; // Include sender
        const uniqueMembers = [...new Set(allGroupMembers)]; // Remove duplicates

        console.log(`Group members for ${groupId}:`, uniqueMembers);

        let sentCount = 0;
        uniqueMembers.forEach(memberId => {
          const memberClient = clients[memberId];
          if (memberClient && memberClient.readyState === WebSocket.OPEN) {
            memberClient.send(JSON.stringify({
              type: "group_message",
              groupId,
              senderId: actualUserId,
              content,
              timestamp: chatMessage.timestamp,
              isFile: data.isFile || false,
              fileType: data.fileType,
              fileName: data.fileName,
              senderName: data.senderName
            }));
            sentCount++;
          } else {
            console.log(`Member ${memberId} not found or connection closed`);
          }
        });

        console.log(`Group message sent in group ${groupId} to ${sentCount}/${uniqueMembers.length} members`);
        return;
      }

      console.log(`Unknown message type: ${type}`);
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    // Find and remove the disconnected client
    Object.keys(clients).forEach((userId) => {
      if (clients[userId] === ws) {
        delete clients[userId];
        console.log(`User ${userId} disconnected. Remaining clients: ${Object.keys(clients).length}`);
      }
    });
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Health check endpoint
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      clients: Object.keys(clients).length,
      directChannels: Object.keys(channels).length,
      groupChannels: Object.keys(groupChannels).length
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

console.log("WebSocket server running on ws://localhost:8080");
console.log("Health check available at http://localhost:8080/health");
