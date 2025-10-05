(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-FARM-ID u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-INVALID-QUOTA u104)
(define-constant ERR-INVALID-PERIOD u105)
(define-constant ERR-FARM-ALREADY-REGISTERED u106)
(define-constant ERR-FARM-NOT-FOUND u107)
(define-constant ERR-LOG-ALREADY-EXISTS u108)
(define-constant ERR-ORACLE-NOT-VERIFIED u109)
(define-constant ERR-INVALID-MIN-USAGE u110)
(define-constant ERR-INVALID-MAX-USAGE u111)
(define-constant ERR-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-LOGS-EXCEEDED u114)
(define-constant ERR-INVALID-USAGE-TYPE u115)
(define-constant ERR-INVALID-EFFICIENCY-RATE u116)
(define-constant ERR-INVALID-GRACE-PERIOD u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-UNIT u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-log-id uint u0)
(define-data-var max-logs uint u10000)
(define-data-var logging-fee uint u500)
(define-data-var oracle-contract (optional principal) none)

(define-map farms
  uint
  {
    owner: principal,
    quota: uint,
    total-usage: uint,
    last-update: uint,
    efficiency-rate: uint,
    period: uint,
    location: (string-utf8 100),
    unit: (string-utf8 20),
    status: bool,
    min-usage: uint,
    max-usage: uint,
    usage-type: (string-utf8 50),
    grace-period: uint
  }
)

(define-map farms-by-owner
  principal
  uint)

(define-map usage-logs
  {farm-id: uint, log-id: uint}
  {
    amount: uint,
    timestamp: uint,
    reporter: principal
  }
)

(define-map farm-updates
  uint
  {
    update-quota: uint,
    update-efficiency-rate: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-farm (id uint))
  (map-get? farms id)
)

(define-read-only (get-farm-updates (id uint))
  (map-get? farm-updates id)
)

(define-read-only (get-usage-log (farm-id uint) (log-id uint))
  (map-get? usage-logs {farm-id: farm-id, log-id: log-id})
)

(define-read-only (is-farm-registered (owner principal))
  (is-some (map-get? farms-by-owner owner))
)

(define-private (validate-farm-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-FARM-ID))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-quota (quota uint))
  (if (> quota u0)
      (ok true)
      (err ERR-INVALID-QUOTA))
)

(define-private (validate-period (period uint))
  (if (> period u0)
      (ok true)
      (err ERR-INVALID-PERIOD))
)

(define-private (validate-efficiency-rate (rate uint))
  (if (<= rate u100)
      (ok true)
      (err ERR-INVALID-EFFICIENCY-RATE))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u30)
      (ok true)
      (err ERR-INVALID-GRACE-PERIOD))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-unit (unit (string-utf8 20)))
  (if (or (is-eq unit "liters") (is-eq unit "gallons") (is-eq unit "cubic-meters"))
      (ok true)
      (err ERR-INVALID-UNIT))
)

(define-private (validate-min-usage (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-USAGE))
)

(define-private (validate-max-usage (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID-MAX-USAGE))
)

(define-private (validate-usage-type (type (string-utf8 50)))
  (if (or (is-eq type "irrigation") (is-eq type "domestic") (is-eq type "industrial"))
      (ok true)
      (err ERR-INVALID-USAGE-TYPE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-oracle-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set oracle-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-logs (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set max-logs new-max)
    (ok true)
  )
)

(define-public (set-logging-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get oracle-contract)) (err ERR-ORACLE-NOT-VERIFIED))
    (var-set logging-fee new-fee)
    (ok true)
  )
)

(define-public (register-farm
  (quota uint)
  (efficiency-rate uint)
  (period uint)
  (location (string-utf8 100))
  (unit (string-utf8 20))
  (min-usage uint)
  (max-usage uint)
  (usage-type (string-utf8 50))
  (grace-period uint)
)
  (let (
        (next-id (var-get next-log-id))
        (current-max (var-get max-logs))
        (oracle (var-get oracle-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX_LOGS-EXCEEDED))
    (try! (validate-quota quota))
    (try! (validate-efficiency-rate efficiency-rate))
    (try! (validate-period period))
    (try! (validate-location location))
    (try! (validate-unit unit))
    (try! (validate-min-usage min-usage))
    (try! (validate-max-usage max-usage))
    (try! (validate-usage-type usage-type))
    (try! (validate-grace-period grace-period))
    (asserts! (is-none (map-get? farms-by-owner tx-sender)) (err ERR-FARM-ALREADY-REGISTERED))
    (let ((oracle-recipient (unwrap! oracle (err ERR-ORACLE-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get logging-fee) tx-sender oracle-recipient))
    )
    (map-set farms next-id
      {
        owner: tx-sender,
        quota: quota,
        total-usage: u0,
        last-update: block-height,
        efficiency-rate: efficiency-rate,
        period: period,
        location: location,
        unit: unit,
        status: true,
        min-usage: min-usage,
        max-usage: max-usage,
        usage-type: usage-type,
        grace-period: grace-period
      }
    )
    (map-set farms-by-owner tx-sender next-id)
    (var-set next-log-id (+ next-id u1))
    (print { event: "farm-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (log-usage
  (farm-id uint)
  (amount uint)
  (timestamp uint)
)
  (let ((farm (map-get? farms farm-id)))
    (match farm
      f
        (begin
          (asserts! (or (is-eq (get owner f) tx-sender) (is-eq tx-sender (unwrap! (var-get oracle-contract) (err ERR-ORACLE-NOT-VERIFIED)))) (err ERR-NOT-AUTHORIZED))
          (try! (validate-amount amount))
          (try! (validate-timestamp timestamp))
          (let ((next-log (fold + (map-get? usage-logs {farm-id: farm-id}) u0)))
            (map-set usage-logs {farm-id: farm-id, log-id: next-log}
              {
                amount: amount,
                timestamp: timestamp,
                reporter: tx-sender
              }
            )
          )
          (map-set farms farm-id
            (merge f {
              total-usage: (+ (get total-usage f) amount),
              last-update: timestamp
            })
          )
          (print { event: "usage-logged", farm-id: farm-id, amount: amount })
          (ok true)
        )
      (err ERR-FARM-NOT-FOUND)
    )
  )
)

(define-public (update-farm
  (farm-id uint)
  (update-quota uint)
  (update-efficiency-rate uint)
)
  (let ((farm (map-get? farms farm-id)))
    (match farm
      f
        (begin
          (asserts! (is-eq (get owner f) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-quota update-quota))
          (try! (validate-efficiency-rate update-efficiency-rate))
          (map-set farms farm-id
            (merge f {
              quota: update-quota,
              efficiency-rate: update-efficiency-rate,
              last-update: block-height
            })
          )
          (map-set farm-updates farm-id
            {
              update-quota: update-quota,
              update-efficiency-rate: update-efficiency-rate,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "farm-updated", id: farm-id })
          (ok true)
        )
      (err ERR-FARM-NOT-FOUND)
    )
  )
)

(define-public (get-farm-count)
  (ok (var-get next-log-id))
)

(define-public (check-farm-existence (owner principal))
  (ok (is-farm-registered owner))
)

(define-read-only (calculate-remaining-quota (farm-id uint))
  (let ((farm (get-farm farm-id)))
    (match farm
      f (- (get quota f) (get total-usage f))
      u0
    )
  )
)