import app from './src/app.js';

let server = null;

export async function startServer() {
  try {
  const port = process.env.PORT || 3000;
  server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
  } catch (error) {
    console.error('Error starting the server:', error);
    process.exit(1);
  }
}

export async function stopServer() {
  try {
    if (server) {
      server.close(() => {
        console.log('Server has been stopped.');
      });
    }
  } catch (error) {
    console.error('Error stopping the server:', error);
    process.exit(1);
  }
}