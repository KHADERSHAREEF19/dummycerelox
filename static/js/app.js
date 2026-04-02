// CereloX Frontend JavaScript

// WebSocket connection
const socket = io();

// Global state
let allLogs = [];
let currentPage = 1;
const logsPerPage = 20;
let charts = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchLogs();
    fetchStats();
    setupCursorTrail();
    setupWebSocket();
    
    // Auto-refresh stats every 5 seconds
    setInterval(fetchStats, 5000);
});

// Page navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

// Theme toggle
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
}

// Fetch logs from API
async function fetchLogs() {
    try {
        const response = await fetch('/api/logs');
        const logs = await response.json();
        allLogs = logs;
        renderLogs();
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Fetch statistics
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        document.getElementById('totalEvents').textContent = stats.total_events.toLocaleString();
        document.getElementById('criticalAlerts').textContent = stats.critical_alerts.toLocaleString();
        document.getElementById('systemHealth').textContent = stats.system_health + '%';
        
        updateCharts(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

// WebSocket event handlers
function setupWebSocket() {
    socket.on('new_log', (log) => {
        allLogs.push(log);
        if (allLogs.length > 200) {
            allLogs.shift();
        }
        renderLogs();
        
        // Show notification for critical events
        if (log.level === 'ERROR' || log.level === 'FAILURE') {
            showNotification('Critical Alert', log.message);
        }
    });
}

// Render logs to table
function renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    const searchTerm = document.getElementById('logSearch')?.value.toLowerCase() || '';
    
    // Filter logs
    const filteredLogs = allLogs.filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        log.source.toLowerCase().includes(searchTerm) ||
        log.level.toLowerCase().includes(searchTerm)
    );
    
    // Pagination
    const startIndex = (currentPage - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
    
    // Clear and populate
    tbody.innerHTML = '';
    
    if (paginatedLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No logs found</td></tr>';
        return;
    }
    
    paginatedLogs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>${log.eventID}</td>
            <td class="log-level-${log.level}">${log.level}</td>
            <td>${log.source}</td>
            <td>${log.message}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Update pagination info
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
}

// Pagination controls
function nextPage() {
    const totalPages = Math.ceil(allLogs.length / logsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderLogs();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderLogs();
    }
}

// Table sorting
let sortDirection = {};

function sortTable(columnIndex) {
    const direction = sortDirection[columnIndex] === 'asc' ? 'desc' : 'asc';
    sortDirection[columnIndex] = direction;
    
    const columns = ['timestamp', 'eventID', 'level', 'source', 'message'];
    const sortKey = columns[columnIndex];
    
    allLogs.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (direction === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
    
    renderLogs();
}

// Search logs
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('logSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderLogs();
        });
    }
});

// Initialize Charts
function initCharts() {
    // EPS Gauge (Doughnut Chart)
    const epsCtx = document.getElementById('epsGauge').getContext('2d');
    charts.eps = new Chart(epsCtx, {
        type: 'doughnut',
        data: {
            labels: ['EPS', 'Idle'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#00ff88', 'rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '70%',
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // Event Distribution Pie Chart
    const pieCtx = document.getElementById('eventPieChart').getContext('2d');
    charts.pie = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: ['Security', 'System', 'Application'],
            datasets: [{
                data: [33, 33, 34],
                backgroundColor: ['#ff0055', '#00d4ff', '#ffdd00'],
                borderWidth: 2,
                borderColor: '#0a0e27'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { 
                    display: true,
                    position: 'bottom',
                    labels: { color: '#fff' }
                }
            }
        }
    });
    
    // Traffic Line Chart
    const trafficCtx = document.getElementById('trafficChart').getContext('2d');
    charts.traffic = new Chart(trafficCtx, {
        type: 'line',
        data: {
            labels: ['5s ago', '4s ago', '3s ago', '2s ago', '1s ago', 'Now'],
            datasets: [{
                label: 'Event Traffic',
                data: [5, 8, 12, 7, 15, 10],
                borderColor: '#00ff88',
                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#a0aec0' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                x: {
                    ticks: { color: '#a0aec0' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#fff' }
                }
            }
        }
    });
}

// Update charts with live data
function updateCharts(stats) {
    // Update EPS gauge
    const epsValue = Math.min(stats.eps, 100);
    charts.eps.data.datasets[0].data = [epsValue, 100 - epsValue];
    charts.eps.update();
    
    // Update traffic chart with random data (mock real-time)
    const newTraffic = Math.floor(Math.random() * 20) + 5;
    charts.traffic.data.datasets[0].data.push(newTraffic);
    charts.traffic.data.datasets[0].data.shift();
    charts.traffic.update();
}

// AI Chatbot
async function sendChatQuery() {
    const input = document.getElementById('chatInput');
    const responseDiv = document.getElementById('chatResponse');
    const query = input.value.trim();
    
    if (!query) return;
    
    responseDiv.classList.add('active');
    responseDiv.innerHTML = '<p class="loading">SaECHO is thinking...</p>';
    
    try {
        const response = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        // Typewriter effect
        let text = data.answer;
        responseDiv.innerHTML = '';
        let i = 0;
        
        const typewriter = setInterval(() => {
            if (i < text.length) {
                responseDiv.innerHTML += text.charAt(i);
                i++;
            } else {
                clearInterval(typewriter);
                
                // Show related logs if any
                if (data.logs && data.logs.length > 0) {
                    responseDiv.innerHTML += '<br><br><strong>Related Logs:</strong><ul>';
                    data.logs.forEach(log => {
                        responseDiv.innerHTML += `<li>${log.timestamp}: ${log.message}</li>`;
                    });
                    responseDiv.innerHTML += '</ul>';
                }
            }
        }, 30);
        
    } catch (error) {
        responseDiv.innerHTML = '<p style="color: #ff0055;">Error: Could not reach SaECHO AI</p>';
    }
    
    input.value = '';
}

// Enter key for chat
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatQuery();
            }
        });
    }
});

// Generate Report
async function generateReport() {
    const btnText = document.getElementById('reportBtnText');
    const preview = document.getElementById('reportPreview');
    
    btnText.textContent = '⏳ Generating Report...';
    preview.innerHTML = '<p class="loading">Building PDF report...</p>';
    
    try {
        // Download the PDF
        window.location.href = '/download_report';
        
        setTimeout(() => {
            btnText.textContent = '✅ Report Downloaded!';
            preview.innerHTML = '<p style="color: #00ff88;">PDF report successfully generated and downloaded!</p>';
            
            setTimeout(() => {
                btnText.textContent = '📄 Generate Report';
                preview.innerHTML = '';
            }, 3000);
        }, 1000);
        
    } catch (error) {
        btnText.textContent = '❌ Error';
        preview.innerHTML = '<p style="color: #ff0055;">Failed to generate report</p>';
    }
}

// Cursor Trail Effect
function setupCursorTrail() {
    const canvas = document.getElementById('cursorTrail');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = [];
    
    document.addEventListener('mousemove', (e) => {
        particles.push({
            x: e.clientX,
            y: e.clientY,
            size: Math.random() * 5 + 2,
            life: 1
        });
    });
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach((particle, index) => {
            particle.life -= 0.02;
            particle.size *= 0.95;
            
            if (particle.life <= 0) {
                particles.splice(index, 1);
            }
            
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 136, ${particle.life})`;
            ctx.fill();
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Notification system
function showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: '/static/img/logo.png'
        });
    }
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}