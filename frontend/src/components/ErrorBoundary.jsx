import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, err:error }; }
  componentDidCatch(error, info){ console.error("ErrorBoundary caught:", error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:"24px",color:"#fff",background:"#111",minHeight:"100vh"}}>
          <h1 style={{marginBottom:8}}>Something went wrong.</h1>
          <pre style={{whiteSpace:"pre-wrap",background:"#1b1b1b",padding:"12px",borderRadius:8}}>
{String(this.state.err)}
          </pre>
          <p>Open DevTools (F12) → Console for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}