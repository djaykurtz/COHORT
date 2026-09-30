/* Superdash v2 S3 -- Broadcast Composer */

var Broadcast = {
  renderPanel() {
    var title = document.getElementById('main-panel-title');
    var badge = document.getElementById('main-panel-badge');
    var content = document.getElementById('main-content');

    title.textContent = 'Broadcast Composer';
    badge.textContent = '';

    var nodes = Object.keys(Nodes.nodeData);
    var nodeOptions = nodes.map(function(n) {
      return '<option value="' + n + '">' + n + '</option>';
    }).join('');

    var html = '<div class="broadcast-form">'
      + '<div class="form-group">'
      + '<label class="form-label">From Node</label>'
      + '<select class="form-select" id="bc-from">' + nodeOptions + '</select>'
      + '</div>'

      + '<div class="form-group">'
      + '<label class="form-label">Type</label>'
      + '<select class="form-select" id="bc-type">'
      + '<option value="info">Info</option>'
      + '<option value="status_update">Status Update</option>'
      + '<option value="request">Request</option>'
      + '<option value="help_request">Help Request</option>'
      + '<option value="reboot_request">Reboot Request</option>'
      + '</select>'
      + '</div>'

      + '<div class="form-group">'
      + '<label class="form-label">Subject</label>'
      + '<input type="text" class="form-input" id="bc-subject" placeholder="Short subject line...">'
      + '</div>'

      + '<div class="form-group">'
      + '<label class="form-label">Content</label>'
      + '<textarea class="form-textarea" id="bc-content" rows="5" placeholder="Message body..."></textarea>'
      + '</div>'

      + '<div class="form-row">'
      + '<label class="form-check"><input type="checkbox" id="bc-attention"> Attention</label>'
      + '<label class="form-check"><input type="checkbox" id="bc-ack"> Requires ACK</label>'
      + '</div>'

      + '<div class="form-actions">'
      + '<button class="btn btn-primary" onclick="Broadcast.send()">Broadcast to Fleet</button>'
      + '<button class="btn btn-secondary" onclick="Broadcast.sendDirect()">Send Direct</button>'
      + '</div>'

      + '<div id="bc-result" class="form-result"></div>'
      + '</div>';

    // Direct message section
    html += '<div class="broadcast-direct">'
      + '<div class="form-group">'
      + '<label class="form-label">Direct → Target Node</label>'
      + '<select class="form-select" id="bc-target">' + nodeOptions + '</select>'
      + '</div>'
      + '</div>';

    content.innerHTML = html;
  },

  async send() {
    var from = document.getElementById('bc-from').value;
    var type = document.getElementById('bc-type').value;
    var subject = document.getElementById('bc-subject').value;
    var body = document.getElementById('bc-content').value;
    var attention = document.getElementById('bc-attention').checked;
    var ack = document.getElementById('bc-ack').checked;
    var resultEl = document.getElementById('bc-result');

    if (!subject) {
      resultEl.innerHTML = '<span class="error">Subject is required</span>';
      return;
    }

    resultEl.innerHTML = '<span class="sending">Broadcasting...</span>';

    try {
      var payload = {
        from_node: from,
        msg_type: type,
        subject: subject,
        content: body || '',
        attention: attention,
        requires_ack: ack
      };

      var resp = await fetch(CONFIG.API_BASE + '/api/messages/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        resultEl.innerHTML = '<span class="success">✓ Broadcast sent to fleet</span>';
        document.getElementById('bc-subject').value = '';
        document.getElementById('bc-content').value = '';
      } else {
        var err = await resp.text();
        resultEl.innerHTML = '<span class="error">Failed: ' + Panels.esc(err) + '</span>';
      }
    } catch (e) {
      resultEl.innerHTML = '<span class="error">Error: ' + Panels.esc(e.message) + '</span>';
    }
  },

  async sendDirect() {
    var from = document.getElementById('bc-from').value;
    var target = document.getElementById('bc-target').value;
    var type = document.getElementById('bc-type').value;
    var subject = document.getElementById('bc-subject').value;
    var body = document.getElementById('bc-content').value;
    var attention = document.getElementById('bc-attention').checked;
    var ack = document.getElementById('bc-ack').checked;
    var resultEl = document.getElementById('bc-result');

    if (!subject) {
      resultEl.innerHTML = '<span class="error">Subject is required</span>';
      return;
    }

    resultEl.innerHTML = '<span class="sending">Sending to ' + target + '...</span>';

    try {
      var payload = {
        from_node: from,
        to_node: target,
        msg_type: type,
        subject: subject,
        content: body || '',
        attention: attention,
        requires_ack: ack
      };

      var resp = await fetch(CONFIG.API_BASE + '/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + CONFIG.AUTH_TOKEN
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        resultEl.innerHTML = '<span class="success">✓ Message sent to ' + target + '</span>';
        document.getElementById('bc-subject').value = '';
        document.getElementById('bc-content').value = '';
      } else {
        var err = await resp.text();
        resultEl.innerHTML = '<span class="error">Failed: ' + Panels.esc(err) + '</span>';
      }
    } catch (e) {
      resultEl.innerHTML = '<span class="error">Error: ' + Panels.esc(e.message) + '</span>';
    }
  }
};
