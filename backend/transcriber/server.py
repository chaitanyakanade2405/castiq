from flask import Flask, request, jsonify
import whisper
import os

app = Flask(__name__)

print("Loading Whisper model...")
model = whisper.load_model("base.en")
print("Whisper model loaded.")

@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    if 'audio' not in request.files:
        return "No audio file in request", 400

    audio_file = request.files['audio']
    
    # Create an absolute path for the temporary file
    script_dir = os.path.dirname(os.path.realpath(__file__))
    temp_path = os.path.join(script_dir, "temp_audio.wav")
    
    audio_file.save(temp_path)

    try:
        result = model.transcribe(temp_path)
        print("Transcription successful for:", temp_path)
        
        os.remove(temp_path)
        
        return jsonify({'transcript': result['text']})
    except Exception as e:
        print(f"Error during transcription: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return "Error during transcription", 500

if __name__ == "__main__":
    app.run(port=5001)