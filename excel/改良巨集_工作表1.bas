' 改良版：貼到 VBA 編輯器「工作表1 (清冊)」的程式碼視窗，取代原本的 Worksheet_Change
' 改善：
'   1. 重新產生前先確認，避免誤觸 A6 清掉整份清冊
'   2. 改用 Rows.Delete，連同表格物件（ListObject）一起刪除，避免表格重疊錯誤
'   3. 檢查筆數必須為 1~200 的整數
'   4. 執行期間關閉事件與畫面更新，結束時一定恢復
' 提醒：模板區(勿動) 請先刪除範例姓名、已繳金額、地號，只保留空白列與公式。
Private Sub Worksheet_Change(ByVal Target As Range)
    If Intersect(Target, Me.Range("A6")) Is Nothing Then Exit Sub
    If Target.CountLarge > 1 Then Exit Sub

    Dim num As Long, i As Long, nextRow As Long
    Dim template As Range

    If Not IsNumeric(Target.Value) Or IsEmpty(Target.Value) Then Exit Sub
    If Target.Value <> Int(Target.Value) Or Target.Value < 1 Or Target.Value > 200 Then
        MsgBox "分割後筆數須為 1～200 的整數。", vbExclamation
        Exit Sub
    End If
    num = CLng(Target.Value)

    Set template = ThisWorkbook.Names("MyTemplate").RefersToRange

    If Application.WorksheetFunction.CountA(Me.Range("A8:H" & Me.Rows.Count)) > 0 Then
        If MsgBox("將重新產生 " & num & " 筆表格，第 8 列以下已輸入的資料會全部刪除。" & vbCrLf & "確定嗎？", _
                  vbQuestion + vbYesNo + vbDefaultButton2) <> vbYes Then Exit Sub
    End If

    On Error GoTo Done
    Application.EnableEvents = False
    Application.ScreenUpdating = False

    Me.Rows("8:" & Me.Rows.Count).Delete

    nextRow = 8
    For i = 1 To num
        template.Copy Destination:=Me.Cells(nextRow, 1)
        nextRow = nextRow + template.Rows.Count + 1
    Next i

Done:
    Application.CutCopyMode = False
    Application.ScreenUpdating = True
    Application.EnableEvents = True
    If Err.Number <> 0 Then MsgBox "產生表格時發生錯誤：" & Err.Description, vbCritical
End Sub
