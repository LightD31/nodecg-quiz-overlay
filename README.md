# Quiz Overlay NodeCG Bundle

A NodeCG bundle for displaying a quiz with score tracking for two teams.

## Features

*   **Two-Team Score Tracking**: Manage scores for two competing teams.
*   **Multiple Question Types**: Supports multiple-choice, true/false, and open-ended questions.
*   **Dynamic Question Loading**: Load quiz questions from JSON files.
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
*   **Layout Editor**: Fine-tune the position and appearance of elements on the overlay.

## Question File Format

Quiz questions are stored in JSON files located in the `questions/` directory. You can create multiple files for different quizzes.

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

## HTTP API

The bundle exposes an HTTP API at `/quiz-overlay/api/` for advanced control. This allows for integration with external software like Bitfocus Companion.

Key endpoints include:
*   `/api/status`: Get the current state of the quiz.
*   `/api/question/next`: Move to the next question.
*   `/api/question/reveal`: Reveal the current answer.
*   `/api/score/team1/add`: Add a point to Team 1.

Refer to `extension/index.js` for a full list of available endpoints.

## Assets

You can upload a custom logo for the overlay via the "Assets" tab on the NodeCG dashboard. The asset category is "images". The selected logo will be used in the `display-settings` panel.
