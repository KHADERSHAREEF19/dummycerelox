"""
CereloX - AI-Powered Log Intelligence
Main Flask Backend with Real-Time Log Monitoring
"""

import os
import sys
import json
import sqlite3
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, send_file, request
from flask_socketio import SocketIO, emit
import threading
import time
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

# Platform detection for Windows Event Log support
WINDOWS_AVAILABLE = sys.platform == 'win32'

if WINDOWS_AVAILABLE:
    try:
        import win32evtlog
        import win32evtlogutil
        import win32con
    except ImportError:
        print("Warning: pywin32 not installed. Install with: pip install pywin32")
        WINDOWS_AVAILABLE = False

# Flask app initialization
app = Flask(__name__)
app.config['SECRET_KEY'] = 'cerelox-secret-key-2024'
socketio = SocketIO(app, cors_allowed_origins="*")

# Database setup
DB_PATH = 'cerelox_logs.db'

def init_database():
    """Initialize SQLite database for log storage"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            eventID INTEGER,
            level TEXT,
            source TEXT,
            message TEXT,
            log_type TEXT
        )
    ''')
    conn.commit()
    conn.close()

# In-memory log buffer for performance
log_buffer = []
MAX_BUFFER_SIZE = 200

# Stats tracking
stats = {
    'total_events': 0,
    'critical_alerts': 0,
    'eps': 0,
    'system_health': 100
}

def normalize_log(event_id, level, source, message, log_type):
    """Normalize log entry into standard JSON format"""
    return {
        'timestamp': datetime.now().isoformat(),
        'eventID': event_id,
        'level': level,
        'source': source,
        'message': message,
        'log_type': log_type
    }

def save_log_to_db(log_entry):
    """Save log entry to SQLite database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO logs (timestamp, eventID, level, source, message, log_type)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            log_entry['timestamp'],
            log_entry['eventID'],
            log_entry['level'],
            log_entry['source'],
            log_entry['message'],
            log_entry['log_type']
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database error: {e}")

def fetch_windows_logs():
    """Fetch real Windows Event Logs using pywin32"""
    if not WINDOWS_AVAILABLE:
        return generate_mock_logs()
    
    logs = []
    log_types = ['Security', 'System', 'Application']
    
    for log_type in log_types:
        try:
            hand = win32evtlog.OpenEventLog(None, log_type)
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            events = win32evtlog.ReadEventLog(hand, flags, 0)
            
            for event in events[:10]:  # Get last 10 from each type
                level_map = {
                    win32con.EVENTLOG_ERROR_TYPE: 'ERROR',
                    win32con.EVENTLOG_WARNING_TYPE: 'WARNING',
                    win32con.EVENTLOG_INFORMATION_TYPE: 'INFO',
                    win32con.EVENTLOG_AUDIT_SUCCESS: 'SUCCESS',
                    win32con.EVENTLOG_AUDIT_FAILURE: 'FAILURE'
                }
                
                level = level_map.get(event.EventType, 'INFO')
                message = str(event.StringInserts) if event.StringInserts else 'No message'
                
                log_entry = normalize_log(
                    event.EventID,
                    level,
                    event.SourceName,
                    message,
                    log_type
                )
                logs.append(log_entry)
            
            win32evtlog.CloseEventLog(hand)
        except Exception as e:
            print(f"Error reading {log_type} logs: {e}")
    
    return logs

def generate_mock_logs():
    """Generate mock logs for non-Windows platforms"""
    import random
    
    mock_sources = ['System', 'Security', 'Application', 'Network', 'Firewall']
    mock_levels = ['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'FAILURE']
    mock_messages = [
        'Service started successfully',
        'Failed login attempt detected',
        'Disk space running low',
        'Network connection established',
        'Firewall rule updated',
        'User authentication failed',
        'System update completed',
        'Suspicious activity detected',
        'Database connection timeout',
        'SSL certificate renewed'
    ]
    
    logs = []
    for _ in range(10):
        log_entry = normalize_log(
            random.randint(1000, 9999),
            random.choice(mock_levels),
            random.choice(mock_sources),
            random.choice(mock_messages),
            random.choice(['Security', 'System', 'Application'])
        )
        logs.append(log_entry)
    
    return logs

def log_monitoring_thread():
    """Background thread for continuous log monitoring"""
    global log_buffer, stats
    
    while True:
        try:
            new_logs = fetch_windows_logs() if WINDOWS_AVAILABLE else generate_mock_logs()
            
            for log_entry in new_logs:
                # Add to buffer
                log_buffer.append(log_entry)
                if len(log_buffer) > MAX_BUFFER_SIZE:
                    log_buffer.pop(0)
                
                # Save to database
                save_log_to_db(log_entry)
                
                # Update stats
                stats['total_events'] += 1
                if log_entry['level'] in ['ERROR', 'FAILURE']:
                    stats['critical_alerts'] += 1
                
                # Emit to frontend via WebSocket
                socketio.emit('new_log', log_entry)
            
            # Calculate EPS (events per second)
            stats['eps'] = len(new_logs) / 5  # Over 5 second interval
            
            time.sleep(5)  # Poll every 5 seconds
        except Exception as e:
            print(f"Log monitoring error: {e}")
            time.sleep(10)

@app.route('/')
def index():
    """Render main dashboard"""
    return render_template('index.html')

@app.route('/api/logs')
def get_logs():
    """Return recent logs as JSON"""
    return jsonify(log_buffer)

@app.route('/api/stats')
def get_stats():
    """Return system statistics"""
    return jsonify(stats)

@app.route('/api/chatbot', methods=['POST'])
def chatbot_query():
    """Handle AI chatbot queries"""
    data = request.json
    query = data.get('query', '').lower()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    response = {
        'answer': '',
        'logs': []
    }
    
    # Query parsing logic
    if 'failed login' in query or 'authentication' in query:
        cursor.execute('''
            SELECT * FROM logs 
            WHERE level = 'FAILURE' AND message LIKE '%login%'
            ORDER BY timestamp DESC LIMIT 10
        ''')
        results = cursor.fetchall()
        response['answer'] = f"Found {len(results)} failed login attempts."
        response['logs'] = [{'timestamp': r[1], 'eventID': r[2], 'message': r[5]} for r in results]
    
    elif 'security alert' in query or 'critical' in query:
        cursor.execute('''
            SELECT * FROM logs 
            WHERE level IN ('ERROR', 'FAILURE') AND log_type = 'Security'
            ORDER BY timestamp DESC LIMIT 10
        ''')
        results = cursor.fetchall()
        response['answer'] = f"Found {len(results)} security alerts."
        response['logs'] = [{'timestamp': r[1], 'eventID': r[2], 'message': r[5]} for r in results]
    
    elif 'today' in query:
        today = datetime.now().date().isoformat()
        cursor.execute('''
            SELECT COUNT(*) FROM logs WHERE timestamp LIKE ?
        ''', (f"{today}%",))
        count = cursor.fetchone()[0]
        response['answer'] = f"Total events today: {count}"
    
    else:
        response['answer'] = "I can help you query logs. Try asking about failed logins, security alerts, or today's events."
    
    conn.close()
    return jsonify(response)

@app.route('/download_report')
def download_report():
    """Generate and download PDF report"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title = Paragraph("<b>CereloX - System Log Report</b>", styles['Title'])
    elements.append(title)
    elements.append(Spacer(1, 12))
    
    # Summary
    summary_text = f"""
    <b>Report Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br/>
    <b>Total Events:</b> {stats['total_events']}<br/>
    <b>Critical Alerts:</b> {stats['critical_alerts']}<br/>
    <b>System Health:</b> {stats['system_health']}%
    """
    summary = Paragraph(summary_text, styles['Normal'])
    elements.append(summary)
    elements.append(Spacer(1, 12))
    
    # Recent logs table
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT timestamp, eventID, level, message FROM logs ORDER BY timestamp DESC LIMIT 20')
    logs = cursor.fetchall()
    conn.close()
    
    table_data = [['Timestamp', 'Event ID', 'Level', 'Message']]
    for log in logs:
        table_data.append([log[0][:19], str(log[1]), log[2], log[3][:50]])
    
    table = Table(table_data)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elements.append(table)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    return send_file(buffer, as_attachment=True, download_name='cerelox_report.pdf', mimetype='application/pdf')

if __name__ == '__main__':
    # Initialize database
    init_database()
    
    # Start log monitoring thread
    monitor_thread = threading.Thread(target=log_monitoring_thread, daemon=True)
    monitor_thread.start()
    
    # Run Flask app
    print("CereloX starting on http://localhost:5000")
    print("Run as Administrator for full Windows Event Log access")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)