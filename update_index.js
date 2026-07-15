const fs = require('fs');

const indexFile = 'c:/Users/Admin/Desktop/SERA-CORE/src/server/index.ts';
let content = fs.readFileSync(indexFile, 'utf8');

// Use a regex to match socket.on('eventName', ...) and inside it, replace requireAuthenticatedSession(socket)
const regex = /socket\.on\('([^']+)',[\s\S]*?requireAuthenticatedSession\(socket\)/g;

content = content.replace(regex, (match, eventName) => {
    return match.replace('requireAuthenticatedSession(socket)', `requireAuthenticatedSession(socket, '${eventName}', instance?.eventBus)`);
});

fs.writeFileSync(indexFile, content, 'utf8');
console.log('Done');
