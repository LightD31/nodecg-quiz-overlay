# Quiz Overlay NodeCG Bundle

A NodeCG bundle for displaying a quiz with score tracking for two teams.

## Features

*   **Two-Team Score Tracking**: Manage scores for two competing teams.
*   **Multiple Question Types**: Supports multiple-choice, true/false, and open-ended questions.
*   **Dynamic Question Loading**: Load quiz questions from JSON files, with the file checked on load and any problems reported in the log and in the control panel.
*   **Controllable Overlay**: Show/hide questions, reveal answers, and manage game state from the NodeCG dashboard.
*   **Customizable Layout**: Adjust team names, colors, and logos.
*   **HTTP API**: Control the quiz programmatically via an HTTP API, compatible with tools like Bitfocus Companion.

## Installation

1.  Clone this repository into the `bundles` directory of your NodeCG installation.
2.  Install dependencies:
    ```sh
    cd nodecg/bundles/quiz-overlay
    npm install
    ```
3.  Run NodeCG. The quiz panels will appear in the dashboard.

## Usage

The bundle is managed through several dashboard panels:

*   **Quiz Control**: The main panel for managing the quiz flow.
    *   Select and load question files.
    *   Navigate through questions (next, previous).
    *   Control the display of the current question (show, hide, reveal answer).
*   **Score Control**: Manually adjust the scores for Team 1 and Team 2.
*   **Display Settings**: Customize the appearance of the overlay.
    *   Change team names and colors.
    *   Set a custom logo.
*   **Layout Editor**: Position the question card on the stream overlay. The team scores are rendered inside the card's header, so they move with it and have no position of their own.

## Question File Format

Quiz questions are stored in JSON files located in the `questions/` directory. You can create multiple files for different quizzes. A working `questions/example.json` ships with the bundle - copy it as a starting point. Your own question files in `questions/` are git-ignored.

The JSON file should contain a single object with a `questions` key, which is an array of question objects.

### Example `questions.json`:

```json
{
  "questions": [
    {
      "type": "multipleChoice",
      "text": "What is the capital of France?",
      "propositions": ["London", "Berlin", "Paris", "Madrid"],
      "correctAnswer": 2,
      "phase": 1
    },
    {
      "type": "trueFalse",
      "text": "The earth is flat.",
      "correctAnswer": 1,
      "phase": 1
    },
    {
      "type": "threeWordsClue",
      "text": "Identify the movie from these three words:",
      "clues": ["Witch", "Lion", "Wardrobe"],
      "answer": "The Chronicles of Narnia",
      "phase": 2
    },
    {
      "type": "funnySummary",
      "text": "What is this movie?",
      "summary": "A billionaire beats up a mentally ill person.",
      "answer": "Batman",
      "phase": 3
    }
  ]
}
```

### Question Types:

*   `multipleChoice`: A standard multiple-choice question.
    *   `text`: The question text.
    *   `propositions`: An array of 4 strings.
    *   `correctAnswer`: The 0-based index of the correct answer in the `propositions` array.
*   `trueFalse`: A true/false question.
    *   `text`: The statement.
    *   `correctAnswer`: `0` for True, `1` for False.
*   `threeWordsClue`: An open-ended question where participants guess something based on three clues.
    *   `text`: A title or instruction.
    *   `clues`: An array of 3 strings.
    *   `answer`: The correct answer (string).
*   `funnySummary`: An open-ended question where participants guess a movie/show from a funny or misleading summary.
    *   `text`: A title or instruction.
    *   `summary`: The summary text.
    *   `answer`: The correct answer (string).

**Note**: The `phase` property is optional and can be used to group questions into different stages of the quiz.

### Validation

Question files are hand-written, so every file is checked when it loads. Anything
suspicious - a missing `text`, a `correctAnswer` pointing past the end of
`propositions`, an unknown `type`, a `threeWordsClue` without `clues` - is
reported as a warning in the NodeCG log and marked with a ⚠ next to the question in
the Quiz Control panel, with the details shown in the question preview.

Questions with problems are still loaded rather than skipped, so question numbers
never shift underneath you mid-show. A file that is not valid JSON at all is
rejected outright and the previously loaded questions are cleared.

## HTTP API

The bundle exposes an HTTP API at `/quiz-overlay/api/` for advanced control. This allows for integration with external software like Bitfocus Companion.

### Response codes

Every endpoint answers with a status code describing what happened, so a client
can tell a refusal from a success without parsing the body.

| Code | Meaning | Example |
| --- | --- | --- |
| `200` | The request was carried out. | Question shown, point added. |
| `400` | The request itself is malformed. | Unknown team, an answer option that is not `a`-`d`, a non-numeric question index. |
| `404` | The thing addressed does not exist. | No question at that index, no such question file. |
| `409` | Understood, but it conflicts with the current state. | Nothing is loaded, the answer is already revealed, that answer is already eliminated, there is no next question, or an answer button was pressed on a question that is answered out loud. |
| `422` | The question file exists but could not be parsed. | Invalid JSON, or no `questions` array. |
| `503` | A replicant is not ready yet. | Requested before NodeCG finished starting up. |

A successful response body is `{ "success": true, ... }`; a refusal is
`{ "error": "..." }` explaining what was wrong.

### Endpoints

#### Status & Files
*   `GET /api/status`: Get the current state of the quiz.
*   `GET /api/files`: Get list of available question files.
*   `POST /api/files/load/:filename`: Load a specific question file. `404` if the file is not in the list, `422` if it cannot be parsed.
*   `POST /api/files/refresh`: Refresh the file list.

#### Question Navigation & Control
*   `POST /api/question/next`: Move to the next question.
*   `POST /api/question/previous`: Move to the previous question.
*   `POST /api/question/show/:index`: Load and show a specific question by index (0-based). `400` if the index is not a number, `404` if there is no question there.
*   `POST /api/question/show`: Show the current question (if hidden).
*   `POST /api/question/hide`: Hide the current question.
*   `POST /api/question/reveal`: Reveal the current answer.

#### Open Question Feedback
*   `POST /api/question/openWrong/:team`: Mark a team (`team1` or `team2`) as having answered wrong on an open question.
*   `POST /api/question/clearWrong`: Clear the wrong feedback for open questions.

#### Score Management
*   `POST /api/score/team1/add`: Add a point to Team 1.
*   `POST /api/score/team1/sub`: Subtract a point from Team 1.
*   `POST /api/score/team2/add`: Add a point to Team 2.
*   `POST /api/score/team2/sub`: Subtract a point from Team 2.
*   `POST /api/score/reset`: Reset both scores to 0.

#### Direct Answering (Auto-scoring)
Simulate a team pressing an answer button (A, B, C, or D). This handles scoring and elimination logic automatically.

Answers are bounded by the question's real options: a True/False question refuses
`c` and `d` with `409`, and a question answered out loud refuses all four - score
those with `/api/score/:team/add` and `/api/question/openWrong/:team` instead.
*   `POST /api/team1/answer/:option`: Team 1 answers. Replace `:option` with `a`, `b`, `c`, or `d`.
*   `POST /api/team2/answer/:option`: Team 2 answers. Replace `:option` with `a`, `b`, `c`, or `d`.

#### Settings
*   `POST /api/settings/revealOnWrong?enabled=true`: Enable/disable revealing the correct answer when a wrong answer is selected.

## Development

The bundle has no runtime dependencies. To run the unit tests:

```sh
npm test
```

### Layout

*   `extension/` - the NodeCG extension. `questions.js` holds the question
    parsing and validation; `index.js` wires up the replicants and the HTTP API.
*   `dashboard/` - the control panels.
*   `graphics/` - the two graphics. `overlay-integrated.html` is the stream
    overlay and `participant.html` is the screen the teams look at. They are
    styled independently, but share their theme derivation and question
    rendering through `graphics/js/theme.js` and `graphics/js/question-view.js`.

## Assets

You can upload a custom logo for the overlay via the "Assets" tab on the NodeCG dashboard. The asset category is "images". The selected logo will be used in the `display-settings` panel.
