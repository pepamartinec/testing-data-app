'use strict';

const { app } = require('../server');

async function startServer(t) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => {
        server.closeAllConnections();
        server.close();
    });
    return `http://127.0.0.1:${server.address().port}`;
}

module.exports = { startServer };
