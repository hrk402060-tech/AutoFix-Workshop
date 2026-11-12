import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  ApiClient({String? baseUrl}) : baseUrl = baseUrl ?? 'http://127.0.0.1/api';
  final String baseUrl;

  Future<dynamic> _request(String path, {String method = 'GET', Object? body}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    final uri = Uri.parse('$baseUrl$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: jsonEncode(body))
        : await http.get(uri, headers: headers);
    final data = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw Exception(data is Map ? data['message'] ?? '请求失败' : '请求失败');
    }
    return data;
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final data = await _request('/auth/login', method: 'POST', body: {'username': username, 'password': password}) as Map<String, dynamic>;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', data['accessToken'] as String);
    return data;
  }

  Future<dynamic> get(String path) => _request(path);
}

