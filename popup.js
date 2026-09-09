let parsedData = [];

document.getElementById('csvFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const text = event.target.result;
    parsedData = parseCSV(text);
    
    if (parsedData.length > 1) { // Assuming first row is header
      const select = document.getElementById('rowSelect');
      select.innerHTML = '';
      
      const headers = parsedData[0];
      
      for (let i = 1; i < parsedData.length; i++) {
        if (parsedData[i].length < headers.length && !parsedData[i][0]) continue; // Skip empty rows
        
        const option = document.createElement('option');
        option.value = i;
        // Try to use a name or ID for display, fallback to row number
        const displayLabel = parsedData[i][0] || `Row ${i}`;
        option.textContent = `Row ${i}: ${displayLabel}`;
        select.appendChild(option);
      }
      
      document.getElementById('controls').style.display = 'block';
      showStatus(`Loaded ${parsedData.length - 1} rows.`);
    } else {
      showStatus("CSV seems empty or only has headers.", true);
    }
  };
  reader.readAsText(file);
});

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', function(e) {
    const val = e.target.value;
    const diag = document.getElementById('diagnosticsSection');
    const pid = document.getElementById('patientIdContainer');

    if (val === 'enrollment') {
      diag.style.display = 'none';
    } else if (val === 'diagnostics') {
      diag.style.display = 'block';
      pid.style.display = 'block';
      
      // Auto-fill patient ID if we saved it previously
      chrome.storage.local.get(['lastPatientId'], function(result) {
        if (result.lastPatientId && !document.getElementById('diagPatientId').value) {
          document.getElementById('diagPatientId').value = result.lastPatientId;
        }
      });
    } else if (val === 'both') {
      diag.style.display = 'block';
      pid.style.display = 'none'; // Will be generated automatically
    }
  });
});

document.getElementById('diagTestType').addEventListener('change', function(e) {
  const labContainer = document.getElementById('xrayLabContainer');
  if (e.target.value === 'Truenat') {
    labContainer.style.display = 'none';
  } else {
    labContainer.style.display = 'block';
  }
});


// BATCH MANAGEMENT
function updateBatchUI() {
  chrome.storage.local.get(['batchActive', 'batchCurrentIndex', 'batchData'], function(res) {
    const batchSection = document.getElementById('batchSection');
    const mainSection = document.getElementById('mainConfigSection');
    
    if (res.batchActive && res.batchData) {
      batchSection.style.display = 'block';
      mainSection.style.display = 'none';
      
      const total = res.batchData.length - 1; // Exclude header
      const current = res.batchCurrentIndex - 1; // Completed rows
      
      document.getElementById('batchProgressText').textContent = `${current} / ${total}`;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      document.getElementById('batchProgressBar').style.width = `${pct}%`;
      
      // If completed
      if (current >= total) {
        document.getElementById('batchProgressText').textContent = "COMPLETE!";
        document.getElementById('resumeBatchBtn').style.display = 'none';
      } else {
        document.getElementById('resumeBatchBtn').style.display = 'block';
      }
    } else {
      batchSection.style.display = 'none';
      mainSection.style.display = 'block';
    }
  });
}

// Initial UI setup
updateBatchUI();

// Download Results CSV
document.getElementById('downloadResultsBtn').addEventListener('click', function() {
  chrome.storage.local.get(['batchData', 'batchResults'], function(res) {
    if (!res.batchData) return showStatus("No batch data found.");
    
    // Create new CSV with original data + Status + Patient ID
    const resultsMap = {};
    if (res.batchResults) {
      res.batchResults.forEach(r => resultsMap[r.row] = r);
    }
    
    let csvContent = "";
    const headers = [...res.batchData[0]];
    headers.push("Automation Status", "Generated Patient ID");
    csvContent += headers.map(h => `"${h}"`).join(",") + "\n";
    
    for (let i = 1; i < res.batchData.length; i++) {
      const row = [...res.batchData[i]];
      const resData = resultsMap[i] || { status: "Not Run", patientId: "N/A" };
      row.push(resData.status, resData.patientId);
      csvContent += row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(",") + "\n";
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Nikshay_Batch_Results_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});

document.getElementById('cancelBatchBtn').addEventListener('click', function() {
  chrome.storage.local.remove(['batchActive'], function() {
    updateBatchUI();
    showStatus("Batch Cancelled.", false);
  });
});

document.getElementById('resumeBatchBtn').addEventListener('click', function() {
  showStatus("Resuming batch... please wait.", false);
  chrome.storage.local.get(['batchCurrentIndex', 'batchMode'], function(res) {
    // Navigate to appropriate page to trigger content.js auto-start
    let url = "https://www.nikshay.in/Dashboard/NewEnrollment";
    if (res.batchMode === 'diagnostics') url = "https://www.nikshay.in/Dashboard/Diagnostics";
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: url });
      } else {
        showStatus("Could not find active tab to resume.", true);
      }
    });
  });
});

document.getElementById('startBatchBtn').addEventListener('click', function() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  
  if (parsedData.length <= 1) {
    showStatus("Please upload a valid CSV first.", true);
    return;
  }
  
  const batchState = {
    batchActive: true,
    batchMode: mode,
    batchData: parsedData,
    batchCurrentIndex: 1, // Start at row index 1
    batchTestType: document.getElementById('diagTestType').value,
    batchResults: []
  };
  
  chrome.storage.local.set(batchState, function() {
    updateBatchUI();
    // Start it off!
    document.getElementById('resumeBatchBtn').click();
  });
});

// Original Fill Single Row
document.getElementById('fillFormBtn').addEventListener('click', function() {
  console.log("Run Single Row clicked!");
  
  const mode = document.querySelector('input[name="mode"]:checked').value;
  let actionName = "fillNikshayForm";
  let payloadData = {};
  
  // Always try to load CSV data if available, since Diagnostics now relies on it for Testing Lab
  if (parsedData.length > 0) {
    const rowIndex = parseInt(document.getElementById('rowSelect').value, 10) || 1;
    const rowData = parsedData[rowIndex];
    const headers = parsedData[0];
    
    if (rowData) {
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i].trim().toLowerCase();
        payloadData[key] = rowData[i] ? rowData[i].trim() : '';
      }
    }
  } else if (mode === 'enrollment' || mode === 'both') {
    showStatus("Please upload a valid CSV first.", true);
    return;
  }
  
  if (mode === 'diagnostics' || mode === 'both') {
    payloadData.testType = payloadData['test type'] || payloadData['testtype'] || document.getElementById('diagTestType').value;
    payloadData.xrayLab = payloadData['testing lab'] || payloadData['x-ray testing lab'] || payloadData['xray lab'] || payloadData['xraylab'] || '';
    
    if (mode === 'diagnostics') {
      actionName = "fillDiagnostics";
      payloadData.patientId = payloadData['nikshay id'] || payloadData['patient id'] || payloadData['patientid'] || payloadData['id'] || document.getElementById('diagPatientId').value.trim();
      if (!payloadData.patientId) {
        showStatus("Please enter a Patient ID or select a CSV row with one.", true);
        return;
      }
    } else {
      actionName = "fillBoth";
    }
  }
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      showStatus("Could not find active Nikshay tab.", true);
      return;
    }
    showStatus("Running automation... please wait.", false);
    document.getElementById('logsContainer').style.display = 'none';
    
    chrome.tabs.sendMessage(tabs[0].id, {
      action: actionName,
      data: payloadData
    }, function(response) {
      if (chrome.runtime.lastError) {
        showStatus("Navigating to page... Please click 'Run Automation' again!", false);
        displayLogs([
          "[INFO] The website is loading a new page.",
          "Because the page refreshed, the automation script was interrupted.",
          "👉 ACTION REQUIRED: Once the target page is fully loaded on your screen, simply click 'Run Automation' one more time!"
        ]);
      } else {
        showStatus(response?.status || "Automation command sent!");
        if (response?.logs) {
          displayLogs(response.logs);
        }
      }
    });
  });
});

function displayLogs(logsArray) {
  const container = document.getElementById('logsContainer');
  const textarea = document.getElementById('logsArea');
  
  if (logsArray && logsArray.length > 0) {
    textarea.value = logsArray.join('\n');
    container.style.display = 'block';
  }
}

document.getElementById('copyLogsBtn').addEventListener('click', function() {
  const textarea = document.getElementById('logsArea');
  textarea.select();
  document.execCommand('copy');
  
  const originalText = this.innerText;
  this.innerText = "Copied!";
  setTimeout(() => { this.innerText = originalText; }, 2000);
});

function showStatus(msg, isError = false) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = msg;
  statusEl.style.color = isError ? 'red' : '#666';
}

function parseCSV(str) {
  const arr = [];
  let quote = false;
  let row = 0, col = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';

    if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
    if (cc == '"') { quote = !quote; continue; }
    if (cc == ',' && !quote) { ++col; continue; }
    if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc == '\n' && !quote) { ++row; col = 0; continue; }
    if (cc == '\r' && !quote) { ++row; col = 0; continue; }

    arr[row][col] += cc;
  }
  return arr;
}
