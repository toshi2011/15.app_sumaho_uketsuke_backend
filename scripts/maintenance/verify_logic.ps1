$baseUrl = "http://127.0.0.1:1338/api"

function Test-Logic {
    Write-Host "Fetching Stores..."
    try {
        $stores = Invoke-RestMethod -Uri "$baseUrl/stores" -Method Get
        $store = $stores.data[0]
        if (-not $store) {
            Write-Error "No stores found."
            return
        }
        $storeId = $store.documentId
        Write-Host "Target Store ID: $storeId"
    } catch {
        Write-Error "Failed to fetch stores: $_"
        return
    }

    # Test 1: Dynamic Duration & Context (Rule B)
    Write-Host "`n--- Test 1: Dynamic Duration & Context ---"
    $date = "2025-12-26"
    
    # Lunch (12:00) - 2 people (Base 90)
    $res2 = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$date&time=12:00&guests=2" -Method Get
    Write-Host "Lunch (2p) Required Duration: $($res2.requiredDuration) (Expected 90)"
    
    # Lunch (12:00) - 4 people (Base 90 + 20 = 110)
    $res4 = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$date&time=12:00&guests=4" -Method Get
    Write-Host "Lunch (4p) Required Duration: $($res4.requiredDuration) (Expected 110)"

    # Dinner (19:00) - 2 people (Base 120)
    $resD2 = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$date&time=19:00&guests=2" -Method Get
    Write-Host "Dinner (2p) Required Duration: $($resD2.requiredDuration) (Expected 120)"

    # Test 2: Buffer Rule (Rule A)
    Write-Host "`n--- Test 2: Buffer Rule ---"
    $bufDate = "2025-12-25"
    
    # Create Reservation: 12:00, 2p (Duration 90) -> Ends 13:30 -> With Buffer 13:45
    $body = @{
        data = @{
            date = $bufDate
            time = "12:00"
            guests = 2
            store = $storeId
            name = "Buffer Test"
            email = "test@example.com"
            phone = "090-0000-0000"
        }
    } | ConvertTo-Json -Depth 5

    try {
        $create = Invoke-RestMethod -Uri "$baseUrl/reservations" -Method Post -Body $body -ContentType "application/json"
        Write-Host "Created Reservation ID: $($create.data.id)"
    } catch {
        Write-Host "Failed to create reservation (might need auth or already exists): $_"
        # Continue anyway to check availability assuming collision if it worked
    }

    # Check 13:00 (Should fail: 13:00 < 13:45)
    $check1300 = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$bufDate&time=13:00&guests=2" -Method Get
    Write-Host "Check 13:00 Available: $($check1300.available) (Expected False)"
    if (-not $check1300.available) {
        Write-Host "Reason: $($check1300.reason)"
    }

    # Check 13:45 (Should pass: 13:45 == 13:45 ? Boundary condition: (Start < End). 13:45 < 13:45 is False. So no overlap.)
    $check1345 = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$bufDate&time=13:45&guests=2" -Method Get
    Write-Host "Check 13:45 Available: $($check1345.available) (Expected True)"

    # Test 3: Action Suggestion (Rule D)
    Write-Host "`n--- Test 3: Action Suggestion ---"
    # We rely on the result from 13:00 check.
    # It failed. Check action.
    Write-Host "13:00 Action: $($check1300.action)"
    
    # To test 'call_store', we need a 'near miss'. 
    # Current failure at 13:00 is due to Capacity (Time overlapping means we count guests).
    # If store has maxCapacity 20, and we reserved 2, currentGuests=2.
    # If we request 20 guests -> Total 22. Max 20. Over 2.
    # Should suggest 'call_store' (<=2 over).
    
    $checkCall = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$bufDate&time=12:00&guests=20" -Method Get
    Write-Host "Check 20p (+2 existing) Action: $($checkCall.action) (Expected call_store)"
    Write-Host "Reason: $($checkCall.reason)"

    # If we request 30 guests -> Total 32. Max 20. Over 12.
    # Should 'reject'.
    $checkReject = Invoke-RestMethod -Uri "$baseUrl/stores/$storeId/check-availability?date=$bufDate&time=12:00&guests=30" -Method Get
    Write-Host "Check 30p (+2 existing) Action: $($checkReject.action) (Expected reject)"
}

Test-Logic
