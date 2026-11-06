$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CompanionInput {
 [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] public struct Union { [FieldOffset(0)] public Mouse mouse; [FieldOffset(0)] public Keyboard keyboard; }
 [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Union value; }
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, Input[] inputs, int size);
 [DllImport("user32.dll", SetLastError=true)] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 static void Send(Input[] inputs) { if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Input))) != inputs.Length) throw new InvalidOperationException("Windows blocked input. Use a normal desktop window at the same privilege level; secure/elevated windows are not supported."); }
 static Input Key(ushort code,uint flags,bool unicode) { return new Input { type=1,value=new Union {keyboard=new Keyboard {key=unicode?(ushort)0:code,scan=unicode?code:(ushort)0,flags=flags}}}; }
 public static void Type(string text) { var inputs=new List<Input>(); foreach(char c in text){inputs.Add(Key(c,4,true));inputs.Add(Key(c,6,true));} Send(inputs.ToArray()); }
 public static void Press(ushort key) { Send(new[]{Key(key,0,false),Key(key,2,false)}); }
 public static void Click(int x,int y) {
  var previous=SetThreadDpiAwarenessContext(new IntPtr(-4));
  try { if(!SetCursorPos(x,y)) throw new InvalidOperationException("Windows could not position the pointer."); Send(new[]{new Input{value=new Union{mouse=new Mouse{flags=2}}},new Input{value=new Union{mouse=new Mouse{flags=4}}}}); }
  finally { if(previous!=IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
 }
}
'@
switch ($inputData.action) {
 'click_screen' { [CompanionInput]::Click([int]$inputData.x,[int]$inputData.y) }
 'type_text' { if($inputData.text.Length -gt 4000){throw 'Type at most 4000 characters.'}; [CompanionInput]::Type([string]$inputData.text) }
 'press_key' {
  $keys=@{Enter=13;Escape=27;Tab=9;Backspace=8;Left=37;Up=38;Right=39;Down=40}
  if(-not $keys.ContainsKey([string]$inputData.key)){throw 'Choose a supported key.'}
  [CompanionInput]::Press([uint16]$keys[[string]$inputData.key])
 }
 default { throw 'Choose a supported computer action.' }
}
[Console]::Out.Write('{"dispatched":true}')
