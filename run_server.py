"""
Run the Carbon Footprint Tracker Server

This script serves both the Flask API and static files.
For production, use a proper WSGI server like Gunicorn or uWSGI.
"""

import os
from chatbot import app

if __name__ == '__main__':
    # Get port from environment or use default
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    host = os.getenv('HOST', '0.0.0.0')
    
    print(f"""
    🚀 Starting Carbon Footprint Tracker Server
    ===========================================
    Server: http://{host}:{port}
    Debug Mode: {debug}
    
    Frontend: http://localhost:{port}/
    API: http://localhost:{port}/api
    Chatbot: http://localhost:{port}/chatbot/chat
    
    Press Ctrl+C to stop the server
    """)
    
    try:
        app.run(host=host, port=port, debug=debug, threaded=True)
    except KeyboardInterrupt:
        print('\n\n👋 Server stopped. Goodbye!')

