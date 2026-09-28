export const examples = {
  'Welcome & input': `// Your first Cambridge pseudocode program
DECLARE Name : STRING
DECLARE Age : INTEGER

OUTPUT "What is your name?"
INPUT Name
OUTPUT "How old are you?"
INPUT Age

IF Age >= 16
  THEN
    OUTPUT "Hello, ", Name, ". Ready for your next chapter!"
  ELSE
    OUTPUT "Hello, ", Name, ". Keep exploring!"
ENDIF`,
  'Times table': `// Inclusive count-controlled loop
DECLARE Number : INTEGER
DECLARE Counter : INTEGER
OUTPUT "Which times table?"
INPUT Number
FOR Counter ← 1 TO 12
    OUTPUT Number, " × ", Counter, " = ", Number * Counter
NEXT Counter`,
  'Countdown': `DECLARE Counter : INTEGER
FOR Counter ← 5 TO 1 STEP -1
    OUTPUT Counter
NEXT Counter
OUTPUT "Lift off!"`,
  'Password loop': `DECLARE Password : STRING
REPEAT
    OUTPUT "Enter the password (Secret)"
    INPUT Password
UNTIL Password = "Secret"
OUTPUT "Access granted"`,
  'Digits & arithmetic': `DECLARE Number : INTEGER
DECLARE Digit : INTEGER
CONSTANT Base ← 10
Number ← 472
WHILE Number > 0 DO
    Digit ← MOD(Number, Base)
    OUTPUT Digit
    Number ← DIV(Number, Base)
ENDWHILE
OUTPUT "2 to the power of 3 = ", 2 ^ 3`,
  'Types & logic': `CONSTANT Rate ← 6.50
DECLARE Hours : REAL
DECLARE Total : REAL
DECLARE Grade : CHAR
DECLARE Passed : BOOLEAN
Hours ← 4.0
Total ← Rate * Hours
Grade ← 'A'
Passed ← Total >= 20.0 AND NOT Grade = 'F'
OUTPUT "Total: ", Total
OUTPUT "Grade: ", Grade, "; passed: ", Passed`,
  'Array of names': `// Arrays use their declared bounds
DECLARE Names : ARRAY[1:3] OF STRING
DECLARE Index : INTEGER
FOR Index ← 1 TO 3
    OUTPUT "Enter name ", Index
    INPUT Names[Index]
NEXT Index
FOR Index ← 1 TO 3
    OUTPUT Index, ": ", Names[Index]
NEXT Index`,
  'Two-dimensional board': `DECLARE Board : ARRAY[1:3, 1:3] OF CHAR
DECLARE Row : INTEGER
DECLARE Column : INTEGER
FOR Row ← 1 TO 3
    FOR Column ← 1 TO 3
        Board[Row,Column] ← '-'
    NEXT Column
NEXT Row
Board[2,2] ← 'X'
FOR Row ← 1 TO 3
    OUTPUT Board[Row,1], " ", Board[Row,2], " ", Board[Row,3]
NEXT Row`,
  'CASE navigation': `DECLARE Move : CHAR
DECLARE Position : INTEGER
Position ← 50
OUTPUT "Choose W, E, A or D"
INPUT Move
Move ← UCASE(Move)
CASE OF Move
    'W' : Position ← Position - 10
    'E' : Position ← Position + 10
    'A' : Position ← Position - 1
    'D' : Position ← Position + 1
    OTHERWISE OUTPUT "Invalid move"
ENDCASE
OUTPUT "Position: ", Position`,
  'Procedures & local scope': `PROCEDURE DisplayMessage(Message : STRING)
    OUTPUT Message
ENDPROCEDURE

PROCEDURE AddOne(Number : INTEGER)
    Number ← Number + 1
    OUTPUT "Inside procedure: ", Number
ENDPROCEDURE

DECLARE Number : INTEGER
Number ← 7
CALL DisplayMessage("Parameters are passed by value")
CALL AddOne(Number)
OUTPUT "Outside procedure: ", Number`,
  'Functions': `FUNCTION SumSquare(Number1 : INTEGER, Number2 : INTEGER) RETURNS INTEGER
    RETURN Number1 * Number1 + Number2 * Number2
ENDFUNCTION

OUTPUT "Sum of squares: ", SumSquare(10, 20)
OUTPUT "In an expression: ", SumSquare(3, 4) + 1`,
  'String & number routines': `DECLARE Text : STRING
DECLARE Letter : CHAR
DECLARE Value : REAL
Text ← "Happy Days"
Letter ← 'w'
OUTPUT "Length: ", LENGTH(Text)
OUTPUT "First word: ", SUBSTRING(Text, 1, 5)
OUTPUT LCASE(Text), " / ", UCASE(Letter)
Value ← ROUND(3.14159, 2)
OUTPUT "Rounded: ", Value
Value ← RANDOM()
OUTPUT "Random value (0 to 1): ", Value`,
  'File copy': `// Files panel includes a sample FileA.txt
DECLARE LineOfText : STRING
OPENFILE "FileA.txt" FOR READ
OPENFILE "FileB.txt" FOR WRITE
READFILE "FileA.txt", LineOfText
WRITEFILE "FileB.txt", LineOfText
CLOSEFILE "FileA.txt"
CLOSEFILE "FileB.txt"
OUTPUT "Copied one line to FileB.txt"`,
  'Class marks search': `DECLARE Marks : ARRAY[1:5] OF INTEGER
DECLARE Index : INTEGER
DECLARE Target : INTEGER
DECLARE Found : BOOLEAN
Marks[1] ← 67
Marks[2] ← 82
Marks[3] ← 91
Marks[4] ← 74
Marks[5] ← 88
OUTPUT "Which mark are you looking for?"
INPUT Target
Found ← FALSE
FOR Index ← 1 TO 5
    IF Marks[Index] = Target
      THEN
        OUTPUT "Found at position ", Index
        Found ← TRUE
    ENDIF
NEXT Index
IF NOT Found
  THEN
    OUTPUT "Mark not found"
ENDIF`,
  'Modular grade report': `FUNCTION Grade(Mark : INTEGER) RETURNS STRING
    IF Mark >= 80
      THEN
        RETURN "Excellent"
      ELSE
        RETURN "Keep practising"
    ENDIF
ENDFUNCTION

PROCEDURE Report(Name : STRING, Mark : INTEGER)
    OUTPUT Name, ": ", Grade(Mark)
ENDPROCEDURE

CALL Report("Ada", 91)
CALL Report("Ali", 74)`,
  'Trace an accumulator': `// Select Counter and Total in the Trace table panel
DECLARE Counter : INTEGER
DECLARE Total : INTEGER
Total ← 0
FOR Counter ← 1 TO 4
    Total ← Total + Counter
NEXT Counter
OUTPUT "Total: ", Total`,
  'Nested logic with arrays': `DECLARE Marks : ARRAY[1:4] OF INTEGER
DECLARE Index : INTEGER
DECLARE Passed : INTEGER
Marks[1] ← 45
Marks[2] ← 72
Marks[3] ← 88
Marks[4] ← 39
Passed ← 0
FOR Index ← 1 TO 4
    IF Marks[Index] >= 50
      THEN
        Passed ← Passed + 1
        OUTPUT "Student ", Index, " passed"
    ENDIF
NEXT Index
OUTPUT "Pass count: ", Passed`,
  'Guessing game': `DECLARE Secret : REAL
DECLARE Guess : INTEGER
Secret ← ROUND(RANDOM() * 9.0, 0) + 1.0
OUTPUT "Guess the number from 1 to 10"
REPEAT
    INPUT Guess
    IF Guess < Secret
      THEN
        OUTPUT "Try higher"
    ENDIF
    IF Guess > Secret
      THEN
        OUTPUT "Try lower"
    ENDIF
UNTIL Guess = Secret
OUTPUT "Correct!"`
};
