use ca_formats::plaintext::Plaintext;
use serde_json::{json, Value};
use std::error::Error;
use std::io::{self, BufReader, BufWriter};

fn main() -> Result<(), Box<dyn Error>> {
    let input: Vec<Value> = serde_json::from_reader(BufReader::new(io::stdin()))?;
    let mut output = Vec::with_capacity(input.len());
    for entry in input {
        let id = entry["id"].as_str().ok_or("pattern id is missing")?;
        let text = entry["pattern"].as_str().ok_or("plaintext pattern is missing")?;
        let cells = Plaintext::new(text)?.collect::<Result<Vec<_>, _>>()?;
        if cells.is_empty() {
            return Err(format!("empty pattern: {id}").into());
        }
        let mut parsed = entry;
        parsed["cells"] = json!(cells);
        parsed.as_object_mut().ok_or("pattern is not an object")?.remove("pattern");
        output.push(parsed);
    }
    serde_json::to_writer(BufWriter::new(io::stdout()), &output)?;
    Ok(())
}
