chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fillNikshayForm") {
    fillForm(request.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ status: "Error: " + err.message, logs: actionLogs }));
    return true; // async response
  }
  if (request.action === "fillDiagnostics") {
    fillDiagnostics(request.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ status: "Error: " + err.message, logs: actionLogs }));
    return true;
  }
  if (request.action === "fillBoth") {
    fillBoth(request.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ status: "Error: " + err.message, logs: actionLogs }));
    return true;
  }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Smart waiting functions
async function waitForElement(selector, maxWaitMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const el = document.querySelector(selector);
    if (el && el.offsetHeight > 0) return el;
    await sleep(200);
  }
  return null;
}

async function waitForCondition(conditionFn, maxWaitMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const result = conditionFn();
    if (result) return result;
    await sleep(200);
  }
  return null;
}

let actionLogs = [];

function addLog(msg, type = "info") {
  const time = new Date().toLocaleTimeString();
  actionLogs.push(`[${time}] [${type.toUpperCase()}] ${msg}`);
  console.log(`[Nikshay Automator] ${msg}`);
}

// Normalizes text for comparison
function normalizeStr(str) {
  return (str || '').replace(/[\*\:\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Find a form group by label text
function findFormGroup(labelText) {
  const labels = Array.from(document.querySelectorAll('label'));
  const target = normalizeStr(labelText);
  
  // 1. Try exact match first to prevent substring bugs (e.g., "Collection Site State" vs "Collection Site")
  for (const label of labels) {
    if (normalizeStr(label.textContent) === target) {
      return label.closest('.form-group') || label.parentElement;
    }
  }
  
  // 2. Fallback to includes
  for (const label of labels) {
    if (normalizeStr(label.textContent).includes(target)) {
      return label.closest('.form-group') || label.parentElement;
    }
  }
  return null;
}

// Set value for a standard text input
function fillTextInput(formGroup, value, fieldName) {
  if (!value) return false;
  if (!formGroup) {
    addLog(`Could not find field group for: ${fieldName}`, "warn");
    return false;
  }
  
  const input = formGroup.querySelector('input[type="text"], input[type="alpha"], input[type="number"], input:not([type])');
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    addLog(`Filled text input '${fieldName}' with '${value}'`, "success");
    return true;
  }
  addLog(`Found group for '${fieldName}' but no suitable text input inside`, "warn");
  return false;
}

// Select a radio button or checkbox by text content of its label
function selectRadioButton(formGroup, value, fieldName) {
  if (!value) return false;
  if (!formGroup) {
    addLog(`Could not find field group for: ${fieldName}`, "warn");
    return false;
  }

  const valNormalized = normalizeStr(value);
  const optionLabels = Array.from(formGroup.querySelectorAll('.radio, .checkbox, label'));
  
  for (const optionLabel of optionLabels) {
    if (normalizeStr(optionLabel.textContent).includes(valNormalized)) {
      const input = optionLabel.querySelector('input[type="radio"], input[type="checkbox"]');
      if (input) {
        if (!input.checked) {
          input.click();
          addLog(`Selected option '${value}' for '${fieldName}'`, "success");
        } else {
          addLog(`Option '${value}' for '${fieldName}' was already selected automatically`, "info");
        }
      } else {
        optionLabel.click();
        addLog(`Selected option '${value}' for '${fieldName}'`, "success");
      }
      return true;
    }
  }
  addLog(`Could not find option matching '${value}' for '${fieldName}'`, "warn");
  return false;
}

async function selectVueDropdown(formGroup, value, fieldName) {
  if (!value) return false;
  if (!formGroup) {
    addLog(`Could not find field group for: ${fieldName}`, "warn");
    return false;
  }
  
  // 1. Try standard native select first
  const nativeSelect = formGroup.querySelector('select');
  if (nativeSelect && !formGroup.querySelector('.v-select')) {
    addLog(`Found native <select> for '${fieldName}', attempting to select '${value}'...`);
    const options = Array.from(nativeSelect.options);
    const valNorm = normalizeStr(value);
    const targetOpt = options.find(opt => normalizeStr(opt.textContent).includes(valNorm));
    if (targetOpt) {
      nativeSelect.value = targetOpt.value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      addLog(`Successfully selected '${value}' for '${fieldName}' (native select)`, "success");
      return true;
    }
  }
  
  // 2. Try v-select
  const vSelect = formGroup.querySelector('.v-select');
  if (!vSelect) {
    addLog(`Found group for '${fieldName}' but no dropdown inside`, "warn");
    return false;
  }
  
  const searchInput = vSelect.querySelector('input[type="search"]');
  if (searchInput) {
    addLog(`Attempting to select '${value}' from dropdown '${fieldName}'...`);
    // Focus to open dropdown
    searchInput.dispatchEvent(new Event('focus', { bubbles: true }));
    searchInput.click();
    await sleep(300);
    
    // Type value
    searchInput.value = value;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Wait for search results to load
    await sleep(2000);
    
    // Find dropdown options, sometimes in a list or div
    const options = Array.from(vSelect.querySelectorAll('li, .vs__dropdown-option, .dropdown-menu li, .vs-dropdown-option, .dropdown-item'));
    const valNorm = normalizeStr(value);
    
    for (const opt of options) {
      if (normalizeStr(opt.textContent).includes(valNorm)) {
        // Vue often responds to mousedown rather than click on options
        opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        opt.click();
        addLog(`Successfully selected '${value}' for '${fieldName}'`, "success");
        return true;
      }
    }
    
    // If not found, blur it to close
    searchInput.dispatchEvent(new Event('blur', { bubbles: true }));
    addLog(`Could not find dropdown option matching '${value}' for '${fieldName}' after searching`, "warn");
  }
  return false;
}

async function handleDuplicatesAlert() {
  // The modal has id="duplicatesAlertModal" and style="display: block;" when visible
  const alertModal = document.getElementById('duplicatesAlertModal');
  if (alertModal && alertModal.style.display === 'block') {
    addLog(`Duplicate patient modal detected. Clicking 'Proceed Anyway'...`, "info");
    const proceedBtn = Array.from(alertModal.querySelectorAll('button')).find(b => 
      normalizeStr(b.textContent).includes('proceed anyway')
    );
    if (proceedBtn) {
      proceedBtn.click();
      addLog(`Clicked 'Proceed Anyway' on duplicate modal`, "success");
      await sleep(1000);
    } else {
      addLog(`Could not find 'Proceed Anyway' button in duplicate modal`, "warn");
    }
  }
}

async function fillForm(data) {
  actionLogs = [];
  addLog("Starting form fill process...", "info");
  
  try {
    // 0. Check if we are already on the enrollment form
    const isFormLoaded = !!findFormGroup('I want to add a person from') || !!findFormGroup('First Name');
    
    if (isFormLoaded) {
      addLog("Enrollment form detected on current page. Proceeding to fill...", "info");
    } else {
      addLog("Form not found on this page. Saving data and navigating to New Enrollment...", "info");
      // Save data so the auto-resume on page load can pick it up
      sessionStorage.setItem('nikshay_auto_enrollment', JSON.stringify(data));
      window.location.href = "https://www.nikshay.in/Dashboard/NewEnrollment";
      // Script will die here due to navigation. The load handler will pick it up.
      return { status: "Navigating to New Enrollment page...", logs: actionLogs };
    }

    // 1. I want to add a person from
    const personFrom = data['person from'] || data['add person from'] || data['sector'];
    if (personFrom) {
      if (selectRadioButton(findFormGroup('I want to add a person from'), personFrom, 'Person From Sector')) {
        addLog(`Waiting for Basic Details section to load...`, "info");
        await waitForCondition(() => findFormGroup('Type of Case Finding'), 5000);
      }
    }
    
    // 2. Type of Case Finding
    const caseFinding = data['case finding'] || data['type of case finding'];
    selectRadioButton(findFormGroup('Type of Case Finding'), caseFinding, 'Type of Case Finding');
    
    // 3. Caste
    selectRadioButton(findFormGroup('Caste'), data['caste'], 'Caste');
    
    // 4. Generate ABHA
    selectRadioButton(findFormGroup('Generate ABHA'), data['generate abha'] || data['abha'], 'Generate ABHA');
    
    // 5. Public PHI
    const phi = data['phi'] || data['public phi'];
    if (phi) {
      const phiLinks = Array.from(document.querySelectorAll('a.pointerCursor'));
      const selectLink = phiLinks.find(a => normalizeStr(a.textContent).includes('click to select'));
      if (selectLink) {
        addLog(`Opening PHI modal...`);
        selectLink.click();
        
        const phiSelectBox = await waitForElement('#phiSelectBox', 3000);
        if (phiSelectBox) {
          const modalFormGroup = phiSelectBox.closest('.form-group');
          await selectVueDropdown(modalFormGroup, phi, 'Public PHI');
          
          // Click the Done button to save and close the modal
          const modal = phiSelectBox.closest('.modal');
          const doneBtn = modal ? Array.from(modal.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'done') : null;
          
          if (doneBtn) {
            doneBtn.click();
            addLog(`Clicked 'Done' button on PHI modal`, "success");
            await waitForCondition(() => !document.getElementById('phiSelectBox'), 3000); // wait for modal to close
          } else {
            addLog(`Could not find 'Done' button in PHI modal`, "warn");
          }
          
        } else {
          addLog(`PHI select box (id='phiSelectBox') not found in modal`, "warn");
        }
      } else {
        addLog(`Could not find 'Click to Select' link for Public PHI`, "warn");
      }
    }
    
    // 5a. First Name
    fillTextInput(findFormGroup('First Name'), data['first name'], 'First Name');
    
    // 6. Middle Name / Last Name
    fillTextInput(findFormGroup('Middle Name'), data['middle name'], 'Middle Name');
    fillTextInput(findFormGroup('Last Name'), data['last name'], 'Last Name');
    
    // 7. Age
    fillTextInput(findFormGroup('Age'), data['age'], 'Age');
    
    // 8. Gender (Handling 'Sex' column and 'M'/'F' values)
    let gender = data['gender'] || data['sex'];
    if (gender) {
      if (gender.toUpperCase() === 'M') gender = 'Male';
      if (gender.toUpperCase() === 'F') gender = 'Female';
      selectRadioButton(findFormGroup('Gender'), gender, 'Gender');
    }
    
    // 9. Primary Phone
    const phone = data['primary phone'] || data['phone'] || data['mobile'] || data['mobile #'];
    if (phone) {
      if (fillTextInput(findFormGroup('Primary Phone'), phone, 'Primary Phone')) {
        // Wait for Nikshay to check for duplicates (alert modal might appear)
        await waitForElement('#duplicatesAlertModal', 3000);
        await handleDuplicatesAlert();
      }
    }
    
    // 10. Address
    if (data['address']) {
      const addressGroup = findFormGroup('Address');
      if (addressGroup) {
        const textarea = addressGroup.querySelector('textarea');
        if (textarea) {
          textarea.value = data['address'];
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          addLog(`Filled textarea 'Address' with '${data['address']}'`, "success");
        } else {
          fillTextInput(addressGroup, data['address'], 'Address');
        }
      } else {
        addLog(`Could not find field group for: Address`, "warn");
      }
    }
    
    // 11. Health Facility
    const healthFacility = data['health facility'] || data['facility'] || data['phc'];
    if (healthFacility) {
      await selectVueDropdown(findFormGroup('Health Facility'), healthFacility, 'Health Facility');
      addLog(`Waiting for Village options to load from server...`, "info");
      await waitForCondition(() => {
        const vg = findFormGroup('Village');
        return vg && vg.querySelectorAll('li, .vs__dropdown-option').length > 0;
      }, 4000); 
    }
    
    // 12. Village
    await selectVueDropdown(findFormGroup('Village'), data['village'], 'Village');
    
    // 12a. Pincode
    fillTextInput(findFormGroup('Pincode'), data['pincode'], 'Pincode');
    
    // 13. Area
    selectRadioButton(findFormGroup('Area'), data['area'], 'Area');
    
    // 14. Marital Status
    selectRadioButton(findFormGroup('Marital Status'), data['marital status'], 'Marital Status');
    
    // 15. Occupation
    await selectVueDropdown(findFormGroup('Occupation'), data['occupation'], 'Occupation');
    
    // 16. Socio Economic Status
    const ses = data['socio economic status'] || data['ses'];
    selectRadioButton(findFormGroup('Socio Economic Status'), ses, 'Socio Economic Status');
    
    // 17. Symptoms
    const symptoms = data['symptoms'] || data['symtoms'];
    if (symptoms) {
      const symList = symptoms.split(';');
      const symGroup = findFormGroup('Symptoms');
      if (symGroup) {
         for (const sym of symList) {
           selectRadioButton(symGroup, sym.trim(), `Symptom: ${sym.trim()}`);
         }
      } else {
        addLog(`Could not find field group for: Symptoms`, "warn");
      }
    }
    
    // 18. Key Population/Risk factors — click "Not Applicable" to uncheck, then click "Others"
    {
      const riskGroup = findFormGroup('Key Population') || findFormGroup('Risk Factors');
      if (riskGroup) {
        addLog("Found Key Population section.", "info");
        
        // Step 1: Click "Not Applicable" to uncheck it
        const labels1 = Array.from(riskGroup.querySelectorAll('label'));
        const naLabel = labels1.find(l => normalizeStr(l.textContent).includes('not applicable'));
        if (naLabel) {
          naLabel.click();
          addLog("Clicked 'Not Applicable' to uncheck it", "success");
          await sleep(500); // Small wait for UI re-render
        }
        
        // Step 2: Re-query labels (Vue may have re-rendered) and click "Others"
        const labels2 = Array.from(riskGroup.querySelectorAll('label'));
        const targetLabel = labels2.find(l => {
          const txt = normalizeStr(l.textContent);
          return txt === 'other' || txt === 'others';
        });
        if (targetLabel) {
          targetLabel.click();
          addLog("Clicked 'Others' for Key Population", "success");
        } else {
          addLog("Could not find 'Others' label in Key Population", "warn");
        }
      } else {
        addLog("Could not find field group for: Key Population", "warn");
      }
    }
    
    // 19. HIV Status
    selectRadioButton(findFormGroup('HIV Status'), data['hiv status'], 'HIV Status');
    
    // 20. Click Add Case / Submit Button
    addLog("Looking for 'Add case' button to submit...", "info");
    const submitCandidates = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], .btn'));
    
    // Sort candidates to prioritize buttons over random links that might contain the text
    submitCandidates.sort((a, b) => (a.tagName === 'BUTTON' ? -1 : (b.tagName === 'BUTTON' ? 1 : 0)));
    
    const addCaseBtn = submitCandidates.find(b => {
      const text = b.textContent || b.value || "";
      const normText = normalizeStr(text);
      return (normText.includes('add case') || normText.includes('proceed to generate abha')) && b.innerText !== '';
    });
    
    if (addCaseBtn) {
      addCaseBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300); // Wait for scroll
      
      // Dispatch full mouse event suite for Vue
      ['mousedown', 'mouseup', 'click'].forEach(evt => {
        addCaseBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
      });
      
      addLog("Clicked 'Add case and proceed' button!", "success");
      
      // Wait for the popup to appear and click Cancel
      addLog("Waiting for the ABHA popup...", "info");
      
      // Look for the specific cancel button or close icon in the dialog
      let cancelBtn = null;
      await waitForCondition(() => {
        cancelBtn = document.querySelector('.action-buttons .cancel, span.close, .dialog .close, .modal .close, button.close');
        if (!cancelBtn) {
          const allButtons = Array.from(document.querySelectorAll('button, a, .btn, [role="button"]'));
          cancelBtn = allButtons.find(b => {
            const rect = b.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const txt = normalizeStr(b.textContent);
            return txt.includes('cancel') || txt.includes('close') || txt === 'no' || txt.includes('do not generate');
          });
        }
        return !!cancelBtn;
      }, 5000);
      
      if (cancelBtn) {
        cancelBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(200);
        ['mousedown', 'mouseup', 'click'].forEach(evt => {
          cancelBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
        });
        addLog("Clicked 'Cancel' on the popup successfully!", "success");
      } else {
        addLog("Could not find any Cancel button on the popup.", "warn");
      }
      
      // Wait for the Patient ID bubble to appear
      addLog("Waiting for Patient ID generation...", "info");
      
      const bubble = await waitForElement('#patientAddedBubble', 8000);
      if (bubble) {
        let patientId = null;
        
        // Try extracting from text: "New Episode added with Id 335433141."
        const match = bubble.textContent.match(/Id\s+(\d+)/i);
        if (match) {
          patientId = match[1];
        } else {
          // Fallback to extracting from the a tag href
          const link = bubble.querySelector('a');
          if (link && link.href) {
            const parts = link.href.split('/');
            patientId = parts[parts.length - 1].trim();
          }
        }
        
        if (patientId) {
          addLog(`✅ Successfully extracted Patient ID: ${patientId}`, "success");
          // Save it to Chrome storage for the next step!
          chrome.storage.local.set({ 'lastPatientId': patientId });
          
          // Log batch progress to console
          chrome.storage.local.get(['batchActive', 'batchCurrentIndex', 'batchData'], (db) => {
            if (db.batchActive && db.batchData) {
              const total = db.batchData.length - 1;
              const done = db.batchCurrentIndex;
              const remaining = total - done;
              console.log(`%c[BATCH] Enrollment ${done}/${total} done | ${remaining} remaining | Patient ID: ${patientId}`, 'color: #28a745; font-weight: bold; font-size: 14px;');
            }
          });
          
          addLog("Enrollment completed successfully!", "info");
          return { status: `Success! Patient ID: ${patientId}`, logs: actionLogs, patientId: patientId };
        } else {
          addLog("Found the success bubble but couldn't parse the Patient ID.", "warn");
        }
      } else {
        addLog("Could not find the patientAddedBubble on the page.", "warn");
      }
      
    } else {
      addLog("Could not find the 'Add case' button to auto-submit.", "warn");
    }

    addLog("Form fill process completed (No ID extracted).", "info");
    return { status: "Form filled finished!", logs: actionLogs };
  } catch (err) {
    addLog(`Fatal error during execution: ${err.message}`, "error");
    throw err;
  }
}

async function fillDiagnostics(data) {
  if (!data._isChained) {
    actionLogs = [];
  }
  addLog(`Starting Diagnostics Automation for Patient ID: ${data.patientId}...`, "info");
  
  // Save state so if the page reloads, the script can auto-continue!
  sessionStorage.setItem('nikshay_auto_diagnostics', JSON.stringify(data));
  
  const setVueDateToToday = async (inputElement) => {
    try {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const dateStr = `${dd}-${mm}-${yyyy}`; // Nikshay format

      // 1. Remove readonly and force set the value
      inputElement.removeAttribute('readonly');
      inputElement.value = dateStr;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      // 2. Reinforce by clicking the UI (handles strict Vue instances)
      const parent = inputElement.closest('.vdp-datepicker') || inputElement.parentElement;
      const calBtn = parent.querySelector('.vdp-datepicker__calendar-button');
      
      if (calBtn) calBtn.click();
      else inputElement.click();
      
      await sleep(500); // Wait for animation
      
      let todayCell = parent.querySelector('.cell.day.today');
      if (!todayCell) {
        todayCell = document.querySelector('.vdp-datepicker__calendar .cell.day.today');
      }
      
      if (todayCell) {
        // Dispatch full mouse event sequence for Vue
        ['mousedown', 'mouseup', 'click'].forEach(evt => {
          todayCell.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
        });
      }
      
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {
      addLog(`Failed to set date: ${e.message}`, "warn");
    }
    return true;
  };
  
  try {
    const isTestFormPage = !!document.getElementById('ReasonForTesting') || window.location.href.includes('/Diagnostics/');
    const isSearchPage = !!document.getElementById('searchText') || document.querySelector('label[for="Add New Test"]');
    console.log("[Nikshay Automator] isTestFormPage:", isTestFormPage, "isSearchPage:", isSearchPage);
    
    // 0. If not on any diagnostics page, navigate from sidebar
    if (!isTestFormPage && !isSearchPage) {
      addLog("Not on Diagnostics page. Looking for sidebar menu...", "info");
      console.log("[Nikshay Automator] Navigating via sidebar...");
        const sideBar = document.getElementById('sideBar');
      if (sideBar) {
        const diagnosticsParent = Array.from(sideBar.querySelectorAll('.menuParent')).find(el => el.textContent.includes('Diagnostics'));
        if (diagnosticsParent && diagnosticsParent.getAttribute('data-state') === 'closed') {
          diagnosticsParent.click();
          await sleep(500); // UI animation
        }
        
        const addTestLink = Array.from(sideBar.querySelectorAll('a')).find(el => el.textContent.includes('Add Test'));
        if (addTestLink) {
          addLog("Clicking 'Diagnostics -> Add Test' from sidebar...", "success");
          addTestLink.click();
          console.log("[Nikshay Automator] Waiting for SPA transition...");
          await waitForElement('#searchText, label[for="Add New Test"], #ReasonForTesting', 6000); // Wait for SPA to transition
        }
      }
    }

    // Re-evaluate state after potential SPA navigation
    const isSearchPageNow = !!document.getElementById('searchText') || document.querySelector('label[for="Add New Test"]');
    
    // If we are on the Search Page, perform search
    if (isSearchPageNow && !document.getElementById('ReasonForTesting')) {
      // 1. Add new Test (toggle switch)
      const addNewTestToggle = document.querySelector('label[for="Add New Test"]');
      if (addNewTestToggle && !addNewTestToggle.classList.contains('selected')) {
        addNewTestToggle.click();
        await sleep(500);
      }

      // 2. Search By Patient ID
      const searchInput = document.getElementById('searchText');
      const searchBtn = document.getElementById('searchButton');
      if (searchInput && searchBtn) {
        searchInput.value = data.patientId;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchBtn.click();
        addLog(`Searched for Patient ID: ${data.patientId}`, "success");
        await waitForElement('.addTestBtn', 6000); // Wait for search results
      }

      // 3. Click "+ Add Test" in the results table
      const addTestBtn = document.querySelector('.addTestBtn');
      if (addTestBtn) {
        addLog("Clicking '+ Add Test' button for the patient...", "success");
        addTestBtn.click();
        await waitForElement('#ReasonForTesting', 6000); // Wait for SPA to transition to the form
      } else {
        addLog("Could not find '+ Add Test' button in search results. Is the ID correct?", "warn");
        sessionStorage.removeItem('nikshay_auto_diagnostics'); // Stop auto-run on failure
        return { status: "Search failed!", logs: actionLogs };
      }
    }

    // Re-evaluate state after potential SPA navigation to the form
    const isTestFormPageNow = !!document.getElementById('ReasonForTesting') || window.location.href.includes('/Diagnostics/');

    // If we reach here, we should be on the actual Test Form page (/Diagnostics/123456)
    // Clear the auto-run flag since we've reached the final destination
    sessionStorage.removeItem('nikshay_auto_diagnostics');
    
    if (!isTestFormPageNow) {
       addLog("Failed to reach the Test Form page.", "error");
       return { status: "Navigation failed", logs: actionLogs };
    }

    // Function to run the specific test form
    const runTestForm = async (testType) => {
      addLog(`--- Filling ${testType} Test Form ---`, "info");
      
      if (testType === 'X-Ray') {
        // Reason for testing -> TB Screening
        const reasonSelect = document.getElementById('ReasonForTesting');
        if (reasonSelect) {
          reasonSelect.value = "TB Screening";
          reasonSelect.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'TB Screening' for Reason for testing", "success");
          await sleep(500); // wait for relevant fields
        }

        // Type of Case -> New
        const typeOfCase = document.getElementById('TypeOfCase');
        if (typeOfCase) {
          typeOfCase.value = "New";
          typeOfCase.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'New' for Type of Case", "success");
        }

        // Test Type -> Chest X Ray
        const testTypeEl = document.getElementById('TestType');
        if (testTypeEl) {
          testTypeEl.value = "Chest X Ray";
          testTypeEl.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'Chest X Ray' for Test Type", "success");
        }

        // Testing Facility State & District
        const stateGroup = findFormGroup('Testing Facility State') || findFormGroup('State');
        const districtGroup = findFormGroup('Testing Facility District') || findFormGroup('District');
        if (stateGroup) await selectVueDropdown(stateGroup, 'Jammu and Kashmir', 'Testing Facility State');
        if (districtGroup) await selectVueDropdown(districtGroup, 'Anantnag', 'Testing Facility District');

        // Testing Lab (X-Ray Testing Lab)
        if (data.xrayLab) {
          const labGroup = findFormGroup('Testing Lab') || findFormGroup('Testing Facility') || findFormGroup('Lab');
          await selectVueDropdown(labGroup, data.xrayLab, 'Testing Lab');
        } else {
          addLog("No X-Ray Testing Lab was provided in the CSV.", "warn");
        }

        // Result Available -> Present
        selectRadioButton(findFormGroup('Result Available'), 'Present', 'Result Available');
        await waitForElement('#ResultDateReported, .date-picker', 3000); // wait for fields to expand

        // Date Reported -> Today
        let dateInput = document.getElementById('ResultDateReported');
        if (!dateInput) {
          const dateGroup = findFormGroup('Date Reported') || findFormGroup('Date');
          if (dateGroup) dateInput = dateGroup.querySelector('input');
        }
        
        if (dateInput) {
          await setVueDateToToday(dateInput);
          addLog(`Set Date Reported to today`, "success");
        } else {
          addLog("Could not find Date Reported input field.", "warn");
        }

        // Final Interpretation -> Normal (Radio group for Result Availability in user snippet, but final interpretation is likely a radio or select)
        const finalIntGroup = findFormGroup('Final Interpretation');
        if (finalIntGroup) {
          if (finalIntGroup.querySelector('.radio')) {
            selectRadioButton(finalIntGroup, 'Normal', 'Final Interpretation');
          } else if (finalIntGroup.querySelector('select')) {
            const select = finalIntGroup.querySelector('select');
            select.value = "Normal";
            select.dispatchEvent(new Event('change', { bubbles: true }));
            addLog("Selected 'Normal' for Final Interpretation", "success");
          } else {
            await selectVueDropdown(finalIntGroup, 'Normal', 'Final Interpretation');
          }
        }

      } else if (testType === 'Truenat') {
        // Reason for testing -> Diagnosis of TB
        const reasonSelect = document.getElementById('ReasonForTesting');
        if (reasonSelect) {
          reasonSelect.value = "Diagnosis of TB";
          reasonSelect.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'Diagnosis of TB' for Reason for testing", "success");
          await sleep(500);
        }

        // Type of Case -> New
        const typeOfCase = document.getElementById('TypeOfCase');
        if (typeOfCase) {
          typeOfCase.value = "New";
          typeOfCase.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'New' for Type of Case", "success");
        }

        // Type of Test -> Truenat (MTB) (User said TestType, ID is TestType)
        const testTypeEl = document.getElementById('TestType');
        if (testTypeEl) {
          testTypeEl.value = "Truenat (MTB)";
          testTypeEl.dispatchEvent(new Event('change', { bubbles: true }));
          addLog("Selected 'Truenat (MTB)' for Test Type", "success");
        }

        // Testing Facility State & District
        const stateGroup = findFormGroup('Testing Facility State') || findFormGroup('State');
        const districtGroup = findFormGroup('Testing Facility District') || findFormGroup('District');
        if (stateGroup) await selectVueDropdown(stateGroup, 'Jammu', 'Testing Facility State');
        if (districtGroup) await selectVueDropdown(districtGroup, 'Anantnag', 'Testing Facility District');

        // Testing Lab -> PHC Saller (HWC)
        await selectVueDropdown(findFormGroup('Testing Lab'), 'PHC Saller (HWC)', 'Testing Lab');

        // Sample Availability -> Present
        selectRadioButton(findFormGroup('Sample Availability'), 'Present', 'Sample Availability');
        await sleep(500);

        // Result Available -> Present
        selectRadioButton(findFormGroup('Result Available'), 'Present', 'Result Available');
        await waitForCondition(() => findFormGroup('Sample Type'), 3000); // Crucial wait for the rest of the form to load

        // Sample Mapping Option -> Present
        const mappingGroup = findFormGroup('Sample Mapping Option') || findFormGroup('Mapping');
        if (mappingGroup) {
          if (!selectRadioButton(mappingGroup, 'Present', 'Sample Mapping Option')) {
             await selectVueDropdown(mappingGroup, 'Present', 'Sample Mapping Option'); // Fallback if it's a dropdown
          }
        }

        // Sample Type -> Sputum
        await selectVueDropdown(findFormGroup('Sample Type'), 'Sputum', 'Sample Type');

        // Sputum Collection Detail -> Early Morning
        await selectVueDropdown(findFormGroup('Sputum Collection Detail') || findFormGroup('Collection Detail'), 'Early Morning', 'Sputum Collection Detail');

        // Sample Description -> Mucopurulent
        await selectVueDropdown(findFormGroup('Sample Description') || findFormGroup('Description'), 'Mucopurulent', 'Sample Description');

        // Collection Date -> Today
        let collectionDateInput = document.getElementById('SampleCollectionDate');
        if (!collectionDateInput) {
          const collectionDateGroup = findFormGroup('Collection Date') || findFormGroup('Date');
          if (collectionDateGroup) collectionDateInput = collectionDateGroup.querySelector('input');
        }
        
        if (collectionDateInput) {
          await setVueDateToToday(collectionDateInput);
          addLog(`Set Collection Date to today`, "success");
        } else {
          addLog("Could not find Collection Date input field.", "warn");
        }

        // Collection Time -> 10:30
        const timeInput = document.getElementById('SampleCollectionTime') || document.querySelector('.time-picker input');
        if (timeInput) {
          const parent = timeInput.closest('.time-picker');
          if (parent) {
             const toggleBtn = parent.querySelector('.dropdown-btn');
             if (toggleBtn) toggleBtn.click();
             await sleep(500);
             
             const hour = parent.querySelector('.hours li[data-key="10"]');
             if (hour) {
               ['mousedown', 'mouseup', 'click'].forEach(evt => hour.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window })));
             }
             
             await sleep(400); // Crucial wait between hour and minute
             
             const minute = parent.querySelector('.minutes li[data-key="30"]');
             if (minute) {
               ['mousedown', 'mouseup', 'click'].forEach(evt => minute.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window })));
             }
             
             await sleep(300);
             if (toggleBtn) toggleBtn.click(); // Close the dropdown
             
             // Force value just to be absolutely certain
             timeInput.removeAttribute('readonly');
             timeInput.value = "10:30";
             timeInput.dispatchEvent(new Event('input', { bubbles: true }));
             timeInput.dispatchEvent(new Event('change', { bubbles: true }));
             timeInput.dispatchEvent(new Event('blur', { bubbles: true }));
             
             addLog("Set Collection Time to 10:30 via picker", "success");
          } else {
            timeInput.removeAttribute('readonly');
            timeInput.value = "10:30";
            timeInput.dispatchEvent(new Event('input', { bubbles: true }));
            addLog("Set Collection Time to 10:30 manually", "success");
          }
        }

        // Collection Site State & District
        const colStateGroup = findFormGroup('Collection Site State');
        const colDistrictGroup = findFormGroup('Collection Site District');
        if (colStateGroup) await selectVueDropdown(colStateGroup, 'Jammu', 'Collection Site State');
        if (colDistrictGroup) await selectVueDropdown(colDistrictGroup, 'Anantnag', 'Collection Site District');

        // Collection Site -> PHC Saller (HWC)
        // Ensure we prioritize EXACT match so it doesn't match State or District
        const siteGroup = findFormGroup('Collection Site') || findFormGroup('Site');
        await selectVueDropdown(siteGroup, 'PHC Saller (HWC)', 'Collection Site');

        // Sample ID -> Sample-1
        await selectVueDropdown(findFormGroup('Sample ID'), 'Sample-1', 'Sample ID');

        // Date Reported -> Today (Added for Truenat)
        let dateReportedInput = document.getElementById('ResultDateReported');
        if (!dateReportedInput) {
          const dateGroup = findFormGroup('Date Reported') || findFormGroup('Reported');
          if (dateGroup) dateReportedInput = dateGroup.querySelector('input');
        }
        
        if (dateReportedInput) {
          await setVueDateToToday(dateReportedInput);
          addLog(`Set Date Reported to today`, "success");
        } else {
          addLog("Could not find Date Reported input field.", "warn");
        }

        // Final Interpretation -> M.Tb. not detected
        const finalIntGroup = findFormGroup('Final Interpretation') || findFormGroup('Interpretation');
        if (finalIntGroup) {
          if (finalIntGroup.querySelector('.radio')) {
            selectRadioButton(finalIntGroup, 'M.Tb. not detected', 'Final Interpretation');
          } else if (finalIntGroup.querySelector('select')) {
            const select = finalIntGroup.querySelector('select');
            select.value = "M.Tb. not detected";
            select.dispatchEvent(new Event('change', { bubbles: true }));
            addLog("Selected 'M.Tb. not detected' for Final Interpretation", "success");
          } else {
             // Maybe it's a vue dropdown
             await selectVueDropdown(finalIntGroup, 'M.Tb. not detected', 'Final Interpretation');
          }
        }
      }
      
      // Submit Test
      addLog("Looking for 'Submit Test' button...", "info");
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(b => normalizeStr(b.textContent).includes('submit test'));
      
      if (submitBtn) {
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);
        
        ['mousedown', 'mouseup', 'click'].forEach(evt => {
          submitBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
        });
        
        addLog(`✅ Clicked 'Submit Test' for ${testType}!`, "success");
        await sleep(1500); // Give server a moment
        
        // Log batch progress to console
        chrome.storage.local.get(['batchActive', 'batchCurrentIndex', 'batchData'], (db) => {
          if (db.batchActive && db.batchData) {
            const total = db.batchData.length - 1;
            const done = db.batchCurrentIndex;
            const remaining = total - done;
            console.log(`%c[BATCH] Test (${testType}) submitted for row ${done}/${total} | ${remaining} remaining`, 'color: #17a2b8; font-weight: bold; font-size: 14px;');
          }
        });
      } else {
        addLog("Could not find 'Submit Test' button.", "warn");
      }
    };

    if (data.testType === 'Both') {
      await runTestForm('X-Ray');
      addLog("X-Ray submitted. Waiting for form to clear before Truenat...", "info");
      await sleep(3000); // Wait for submission
      await runTestForm('Truenat');
    } else {
      await runTestForm(data.testType);
    }
    
    // Clear the auto-resume state since we're done
    sessionStorage.removeItem('nikshay_auto_diagnostics');
    
    addLog("✅ Diagnostics fill process completed.", "info");
    return { status: "Diagnostics form filled!", logs: actionLogs };

  } catch (err) {
    addLog(`Fatal error during execution: ${err.message}`, "error");
    throw err;
  }
}

// Auto-Resume logic for Diagnostics (survives page reloads)


// --- Full Flow (Enroll + Diagnostics) ---
async function fillBoth(data) {
  addLog("--- Starting Full Flow: Enrollment + Diagnostics ---", "info");
  
  data._intent = 'both'; // Save intent for auto-resume
  
  // 1. Run Enrollment
  const formResult = await fillForm(data);
  
  if (formResult.patientId) {
    addLog(`Enrollment complete! Captured Patient ID: ${formResult.patientId}`, "success");
    addLog("Proceeding to Diagnostics automation...", "info");
    
    // Inject the generated ID into the data payload
    data.patientId = formResult.patientId;
    data._isChained = true;
    
    // 2. Run Diagnostics (This will trigger sidebar nav, set sessionStorage, and auto-resume!)
    const diagResult = await fillDiagnostics(data);
    return diagResult;
  } else if (formResult.status && formResult.status.includes("Navigating")) {
    addLog("Waiting for navigation to New Enrollment page...", "info");
    return formResult; // Return without error, as auto-resume will handle it
  } else {
    addLog("Could not capture Patient ID. Aborting Diagnostics.", "error");
    return { status: "Failed to capture Patient ID", logs: actionLogs };
  }
}

// --- Batch Processing Handlers ---
async function finishBatchRow(status, patientId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['batchActive', 'batchCurrentIndex', 'batchData', 'batchMode', 'batchResults'], async (db) => {
      if (db.batchActive && db.batchCurrentIndex < db.batchData.length) {
        // Save the result for this row
        const results = db.batchResults || [];
        results.push({
          row: db.batchCurrentIndex,
          status: status,
          patientId: patientId || "N/A"
        });
        
        const totalRows = db.batchData.length - 1;
        const completedCount = results.length;
        const remainingCount = totalRows - completedCount;
        
        const progressMsg = `Row ${db.batchCurrentIndex}/${totalRows} Completed | Patient ID: ${patientId || 'N/A'} | Remaining: ${remainingCount}`;
        addLog(`[PROGRESS] ${progressMsg}`, "success");
        console.log(`%c[NIKSHAY BATCH] ${progressMsg}`, 'color: #007bff; font-weight: bold; font-size: 14px; background: #eef6ff; padding: 4px 8px; border-radius: 4px;');
        
        const nextIndex = db.batchCurrentIndex + 1;
        
        if (nextIndex < db.batchData.length) {
          // Move to next row
          await chrome.storage.local.set({ 
            batchCurrentIndex: nextIndex,
            batchResults: results 
          });
          
          addLog(`Batch: Starting next row (${nextIndex}/${totalRows}) in 5 seconds...`, "info");
          await sleep(5000); // Give Nikshay servers a breather
          
          // Trigger a hard reload to the correct start page
          if (db.batchMode === 'enrollment' || db.batchMode === 'both') {
            window.location.href = "https://www.nikshay.in/Dashboard/NewEnrollment"; 
          } else {
            window.location.href = "https://www.nikshay.in/Dashboard/Diagnostics";
          }
        } else {
          // Finished entire batch!
          await chrome.storage.local.set({ batchActive: false, batchResults: results });
          addLog(`🎉 BATCH PROCESSING COMPLETE! Total ${totalRows} rows processed.`, "success");
          console.log(`%c[NIKSHAY BATCH COMPLETE] All ${totalRows} rows processed successfully! Downloading CSV report...`, 'color: #28a745; font-weight: bold; font-size: 16px;');
          
          // Automatically download the CSV file for the user
          try {
             downloadCSVFromContentScript(db.batchData, results);
          } catch (e) {
             console.error("Failed to download CSV: ", e);
          }
          
          alert(`Nikshay Batch Processing Complete!\n\nTotal Processed: ${totalRows}\nThe results CSV report has been downloaded.`);
        }
      }
      resolve();
    });
  });
}

// Auto-Resume logic for Batch processing & Mid-task navigation
window.addEventListener('load', () => {
  // 0. Check if Enrollment form needs auto-resume (navigated from another page)
  const autoEnrollState = sessionStorage.getItem('nikshay_auto_enrollment');
  if (autoEnrollState && window.location.href.includes('Dashboard/NewEnrollment')) {
    sessionStorage.removeItem('nikshay_auto_enrollment');
    try {
      const parsedData = JSON.parse(autoEnrollState);
      setTimeout(async () => {
        let result;
        if (parsedData._intent === 'both') {
          result = await fillBoth(parsedData);
        } else {
          result = await fillForm(parsedData);
        }
        
        // If a batch is active, advance to next row
        chrome.storage.local.get(['batchActive'], async (db) => {
          if (db.batchActive) {
            // If it was 'both', we only finish if diagnostics didn't trigger a full page reload
            if (parsedData._intent !== 'both' || !sessionStorage.getItem('nikshay_auto_diagnostics')) {
              await finishBatchRow(result.status || "Finished", result.patientId || parsedData.patientId);
            }
          }
        });
      }, 2000);
    } catch (e) {
      console.error("Failed to auto-resume Nikshay enrollment", e);
    }
    return;
  }

  // 1. Check if Diagnostics is mid-execution (navigated between search and form)
  const autoRunState = sessionStorage.getItem('nikshay_auto_diagnostics');
  
  if (autoRunState) {
    try {
      const parsedData = JSON.parse(autoRunState);
      setTimeout(async () => {
        const diagResult = await fillDiagnostics(parsedData);
        // If a batch is active, this was the final step of the chained row!
        chrome.storage.local.get(['batchActive'], async (db) => {
          if (db.batchActive && !sessionStorage.getItem('nikshay_auto_diagnostics')) {
            await finishBatchRow(diagResult.status || "Finished", parsedData.patientId);
          }
        });
      }, 1500);
    } catch (e) {
      console.error("Failed to auto-resume Nikshay automation", e);
    }
    return; // Stop here, Diagnostics auto-resume handles this page
  }
  
  // 2. Otherwise, check if we are at the beginning of a Batch Row
  chrome.storage.local.get(['batchActive', 'batchCurrentIndex', 'batchData', 'batchMode', 'batchTestType', 'batchXrayLab'], (db) => {
    if (db.batchActive && db.batchCurrentIndex < db.batchData.length) {
      
      const currentUrl = window.location.href;
      
      // We need to figure out if we are on the correct start page
      if ((db.batchMode === 'enrollment' || db.batchMode === 'both') && currentUrl.includes('Dashboard/NewEnrollment')) {
        setTimeout(() => startBatchRowExecution(db), 3000);
      } else if (db.batchMode === 'diagnostics' && currentUrl.includes('Dashboard/Diagnostics')) {
        setTimeout(() => startBatchRowExecution(db), 3000);
      }
    }
  });
});

async function startBatchRowExecution(db) {
  const rowData = db.batchData[db.batchCurrentIndex];
  const headers = db.batchData[0];
  let payloadData = {};
  
  // Construct payload from CSV
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i].trim().toLowerCase();
    payloadData[key] = rowData[i] ? rowData[i].trim() : '';
  }
  
  // Add diagnostics settings, prioritizing CSV row data over the general batch settings
  payloadData.testType = payloadData['test type'] || payloadData['testtype'] || db.batchTestType;
  payloadData.xrayLab = payloadData['x-ray testing lab'] || payloadData['xray lab'] || payloadData['xraylab'] || db.batchXrayLab;
  payloadData.xrayLab = payloadData['x-ray testing lab'] || payloadData['xray lab'] || payloadData['xraylab'] || payloadData['testing lab'] || '';
  
  if (db.batchMode === 'enrollment') {
    const result = await fillForm(payloadData);
    // Only finish if we aren't navigating to reload the page
    if (!result.status || !result.status.includes("Navigating")) {
      await finishBatchRow(result.status || "Finished", result.patientId);
    }
  } else if (db.batchMode === 'both') {
    const result = await fillBoth(payloadData);
    // In 'both' mode, diagnostics might be chaining via auto-resume. Don't finish row early.
    if ((!result.status || !result.status.includes("Navigating")) && !sessionStorage.getItem('nikshay_auto_diagnostics')) {
      await finishBatchRow(result.status || "Finished", payloadData.patientId);
    }
  } else if (db.batchMode === 'diagnostics') {
    payloadData.patientId = payloadData['nikshay id'] || payloadData['patient id'] || payloadData['patientid'] || payloadData['id'];
    if (!payloadData.patientId) {
      await finishBatchRow("Failed: No Patient ID in CSV", null);
      return;
    }
    const result = await fillDiagnostics(payloadData);
    if ((!result.status || !result.status.includes("Navigating")) && !sessionStorage.getItem('nikshay_auto_diagnostics')) {
      await finishBatchRow(result.status || "Finished", payloadData.patientId);
    }
  }
}

// Utility to download CSV directly from content script when batch finishes
function downloadCSVFromContentScript(batchData, batchResults) {
    const resultsMap = {};
    if (batchResults) {
      batchResults.forEach(r => resultsMap[r.row] = r);
    }
    
    let csvContent = "";
    const headers = [...batchData[0]];
    headers.push("Automation Status", "Generated Patient ID");
    csvContent += headers.map(h => `"${h}"`).join(",") + "\n";
    
    for (let i = 1; i < batchData.length; i++) {
      const row = [...batchData[i]];
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
}
